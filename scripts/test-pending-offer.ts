/**
 * Prueba dedicada a las secciones 7 y 8 de la spec `enumerated-disambiguation`:
 * la oferta pendiente caduca con la misma ventana que el foco, y un
 * afirmativo contra una oferta de una sola opción la ejecuta directo.
 *
 *   npx tsx scripts/test-pending-offer.ts
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
  const { userRepository } = await import('../src/data/repositories/user.repository');

  const suffix = Date.now().toString(36);
  const createdScopeIds: string[] = [];
  const createdIntentIds: string[] = [];
  const existingScopeStates: Array<{ id: string; is_active: boolean }> = [];
  const phone = `po${suffix}`;

  try {
    const { data: existing } = await supabaseServer
      .from('scopes').select('id, is_active').eq('parent_id', ROOT_SCOPE_ID).eq('is_active', true);
    existingScopeStates.push(...(existing || []));
    for (const row of existing || []) {
      await supabaseServer.from('scopes').update({ is_active: false }).eq('id', row.id);
    }
    scopeRepository.invalidateCache();

    const { data: devA, error: devAError } = await supabaseServer.from('scopes').insert({
      name: `Dev${suffix}`, parent_id: ROOT_SCOPE_ID,
      slug: `dev-${suffix}`, scope_type: 'development', is_active: true,
    }).select('id').single();
    if (devAError) throw devAError;
    const { data: devB, error: devBError } = await supabaseServer.from('scopes').insert({
      name: `Otro${suffix}`, parent_id: ROOT_SCOPE_ID,
      slug: `otro-${suffix}`, scope_type: 'development', is_active: true,
    }).select('id').single();
    if (devBError) throw devBError;
    createdScopeIds.push(devA.id, devB.id);
    scopeRepository.invalidateCache();

    const priceKw = [`precio${suffix}`];
    const { data: intents, error: intentsError } = await supabaseServer
      .from('intent_configurations')
      .insert([
        { intent_name: 'precio', display_name: 'precio', scope_id: devA.id, keywords: priceKw, is_active: true },
        { intent_name: 'precio', display_name: 'precio', scope_id: devB.id, keywords: priceKw, is_active: true },
      ])
      .select('id, scope_id');
    if (intentsError) throw intentsError;
    createdIntentIds.push(...intents.map(i => i.id));
    const { error: responsesError } = await supabaseServer.from('bot_responses').insert(
      intents.map(intent => ({
        intent_id: intent.id, response_key: 'main', response_type: 'simple',
        message_text: `precio-${intent.scope_id}-${suffix}`, is_active: true, order_priority: 1,
      }))
    );
    if (responsesError) throw responsesError;
    scopeRepository.invalidateCache();
    intentDetectionService.invalidateAll();

    // --- Genera la oferta de dos desarrollos.
    const ask = await messageProcessor.processMessage(phone, `precio${suffix}`, `t1-${suffix}`, 'Test');
    assert(!ask.isFallback, `Price question must disambiguate: ${JSON.stringify(ask)}`);
    const userId = (await supabaseServer.from('users').select('id').eq('phone_number', phone).single()).data!.id;

    // --- 7.5: una oferta de hace dos días no se resuelve con un "sí" de hoy.
    await supabaseServer.from('user_sessions').update({
      pending_offer_updated_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    }).eq('user_id', userId);
    const staleYes = await messageProcessor.processMessage(phone, 'si', `t2-${suffix}`, 'Test');
    assert(
      !staleYes.responses.some(r => typeof r === 'string' && r.includes(`precio-${devA.id}-${suffix}`)),
      `A "sí" against a two-day-old offer must not resolve it: ${JSON.stringify(staleYes)}`
    );
    assert(
      staleYes.responses.some(r => typeof r === 'string' && r.includes('¿Sí a qué?')),
      `A "sí" without a live offer must ask what it refers to, not fall back: ${JSON.stringify(staleYes)}`
    );

    // --- 8.5: "sí" tras una oferta de una sola opción la ejecuta directo.
    await userRepository.setPendingOffer(userId, 'precio', null, [
      { id: devA.id, scopeId: devA.id, label: `Dev${suffix}` },
    ]);
    const singleYes = await messageProcessor.processMessage(phone, 'sí', `t3-${suffix}`, 'Test');
    assert(
      singleYes.responses.some(r => typeof r === 'string' && r.includes(`precio-${devA.id}-${suffix}`)),
      `A "sí" against a single-option offer must execute it directly: ${JSON.stringify(singleYes)}`
    );
    assert(singleYes.scopeId === devA.id, 'The single-option offer must set focus to that option');

    // --- 8.3: "sí" contra una oferta de varias opciones no elige, repite.
    await userRepository.setPendingOffer(userId, 'precio', null, [
      { id: devA.id, scopeId: devA.id, label: `Dev${suffix}` },
      { id: devB.id, scopeId: devB.id, label: `Otro${suffix}` },
    ]);
    const multiYes = await messageProcessor.processMessage(phone, 'sí', `t4-${suffix}`, 'Test');
    assert(
      !multiYes.responses.some(r => typeof r === 'string' && (r.includes(`precio-${devA.id}`) || r.includes(`precio-${devB.id}`))),
      `A "sí" against a multi-option offer must not pick one: ${JSON.stringify(multiYes)}`
    );
    const session = await userRepository.getSession(userId);
    assert(
      session?.pending_offer_options?.length === 2,
      `A "sí" against a multi-option offer must keep both options alive: ${JSON.stringify(session?.pending_offer_options)}`
    );

    console.log('Pending offer verification passed');
  } finally {
    const { data: user } = await supabaseServer.from('users').select('id').eq('phone_number', phone).maybeSingle();
    if (user) {
      await supabaseServer.from('conversations').delete().eq('user_id', user.id);
      await supabaseServer.from('user_scope_progress').delete().eq('user_id', user.id);
      await supabaseServer.from('appointments').delete().eq('user_id', user.id);
      await supabaseServer.from('followup_messages').delete().eq('user_id', user.id);
      await supabaseServer.from('user_sessions').delete().eq('user_id', user.id);
      await supabaseServer.from('users').delete().eq('id', user.id);
    }
    if (createdIntentIds.length > 0) {
      await supabaseServer.from('bot_responses').delete().in('intent_id', createdIntentIds);
      await supabaseServer.from('intent_configurations').delete().in('id', createdIntentIds);
    }
    if (createdScopeIds.length > 0) {
      await supabaseServer.from('scopes').delete().in('id', createdScopeIds);
    }
    for (const row of existingScopeStates) {
      await supabaseServer.from('scopes').update({ is_active: row.is_active ?? true }).eq('id', row.id);
    }
    scopeRepository.invalidateCache();
    intentDetectionService.invalidateAll();
  }
}

main().catch(error => {
  console.error('Pending offer verification failed:', error);
  process.exit(1);
});
