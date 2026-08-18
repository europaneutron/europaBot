/**
 * Prueba dedicada a la spec `enumerated-disambiguation`, seccion 2: una
 * intencion que solo vive en las ramas tiene que detectarse sin foco y
 * desambiguar, no caer al fallback; una pregunta ausente del material sigue
 * cayendo al fallback igual que antes.
 *
 *   npx tsx scripts/test-branch-only-intent.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.development.local') });
config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!supabaseUrl || (!supabaseUrl.includes('127.0.0.1') && !supabaseUrl.includes('localhost'))) {
  console.error('NEXT_PUBLIC_SUPABASE_URL must point to the local stack');
  process.exit(1);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const { supabaseServer } = await import('../src/services/supabase/server-client');
  const { messageProcessor } = await import('../src/core/conversation/message-processor');
  const { scopeRepository, ROOT_SCOPE_ID } = await import('../src/data/repositories/scope.repository');
  const { intentDetectionService } = await import('../src/core/intent-engine/intent-detection.service');

  const suffix = Date.now().toString(36);
  const createdScopeIds: string[] = [];
  const createdIntentIds: string[] = [];
  const existingScopeStates: Array<{ id: string; is_active: boolean }> = [];
  const phone = `bo${suffix}`;

  try {
    const { data: existingScopes, error: existingScopesError } = await supabaseServer
      .from('scopes')
      .select('id, is_active')
      .neq('id', ROOT_SCOPE_ID);
    if (existingScopesError) throw existingScopesError;
    existingScopeStates.push(...(existingScopes || []));
    if (existingScopeStates.length > 0) {
      const { error } = await supabaseServer
        .from('scopes')
        .update({ is_active: false })
        .in('id', existingScopeStates.map(scope => scope.id));
      if (error) throw error;
    }
    scopeRepository.invalidateCache();

    const [devA, devB] = await Promise.all([
      supabaseServer.from('scopes').insert({ parent_id: ROOT_SCOPE_ID, name: `DevA ${suffix}`, slug: `deva-${suffix}`, is_active: true }).select('id').single(),
      supabaseServer.from('scopes').insert({ parent_id: ROOT_SCOPE_ID, name: `DevB ${suffix}`, slug: `devb-${suffix}`, is_active: true }).select('id').single(),
    ]);
    if (devA.error) throw devA.error;
    if (devB.error) throw devB.error;
    createdScopeIds.push(devA.data.id, devB.data.id);
    scopeRepository.invalidateCache();

    // `ubicacion` solo existe en las ramas: cada desarrollo tiene direccion
    // propia y la raiz no define nada para esa intencion.
    const locationIntentName = `branch_only_ubicacion_${suffix}`;
    const locationKeyword = `ubicados${suffix}`;
    const { data: locationIntents, error: locationIntentsError } = await supabaseServer
      .from('intent_configurations')
      .insert([
        { scope_id: devA.data.id, intent_name: locationIntentName, display_name: 'A', keywords: [locationKeyword], is_active: true, is_checkpoint: false },
        { scope_id: devB.data.id, intent_name: locationIntentName, display_name: 'B', keywords: [locationKeyword], is_active: true, is_checkpoint: false },
      ])
      .select('id, scope_id');
    if (locationIntentsError) throw locationIntentsError;
    createdIntentIds.push(...locationIntents.map(i => i.id));
    const { error: locationResponsesError } = await supabaseServer.from('bot_responses').insert(
      locationIntents.map(intent => ({
        intent_id: intent.id,
        response_key: 'main',
        message_text: `ubicacion-${intent.scope_id}`,
        response_type: 'simple',
        is_active: true,
      }))
    );
    if (locationResponsesError) throw locationResponsesError;
    scopeRepository.invalidateCache();
    intentDetectionService.invalidateAll();

    // 2.3: sin foco, detecta la intencion presente solo en las ramas y
    // desambigua en vez de caer al fallback.
    const withoutFocus = await messageProcessor.processMessage(
      phone,
      `donde estan ${locationKeyword}`,
      `branch-only-${suffix}`,
      'Branch Only Test'
    );
    assert(!withoutFocus.isFallback, `A branch-only intent must not fall back: ${JSON.stringify(withoutFocus)}`);
    assert(withoutFocus.wasDetected, 'The intent must be detected without focus');
    assert(
      withoutFocus.responses.some(r => typeof r === 'string' && r.includes('¿De cuál')),
      `An intent absent from the root must be resolved by disambiguating: ${JSON.stringify(withoutFocus.responses)}`
    );

    // 2.4: una pregunta ausente del material sigue cayendo al fallback.
    const absent = await messageProcessor.processMessage(
      phone,
      `esto no existe en ningun lado ${suffix}`,
      `absent-${suffix}`,
      'Branch Only Test'
    );
    assert(absent.isFallback, `A question absent from the material must still fall back: ${JSON.stringify(absent)}`);

    console.log('Branch-only intent detection verification passed');
  } finally {
    await supabaseServer.from('users').delete().eq('phone_number', phone);
    if (createdIntentIds.length > 0) {
      await supabaseServer.from('bot_responses').delete().in('intent_id', createdIntentIds);
      await supabaseServer.from('intent_configurations').delete().in('id', createdIntentIds);
    }
    if (createdScopeIds.length > 0) {
      await supabaseServer.from('scopes').delete().in('id', createdScopeIds);
    }
    for (const scope of existingScopeStates) {
      await supabaseServer
        .from('scopes')
        .update({ is_active: scope.is_active ?? true })
        .eq('id', scope.id);
    }
    scopeRepository.invalidateCache();
    intentDetectionService.invalidateAll();
  }
}

main().catch(error => {
  console.error('Branch-only intent detection verification failed:', error);
  process.exit(1);
});
