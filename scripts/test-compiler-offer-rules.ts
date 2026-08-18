/**
 * Prueba dedicada a la seccion 9 de la spec `enumerated-disambiguation`: las
 * dos reglas nuevas de publicacion (oferta de si/no sin declarar, respuesta
 * que cruza ramas sin nombrarlas) como funciones puras, y que una respuesta
 * compilada que declara su oferta la registra en runtime para que un "si"
 * la resuelva.
 *
 *   npx tsx scripts/test-compiler-offer-rules.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.development.local') });
config({ path: resolve(process.cwd(), '.env.local') });

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function testPureRules() {
  const { endsInYesNoQuestion, checkOfferDeclared, checkBranchesNamed } =
    await import('../src/core/document-compiler/compiler-rules');

  // 9.1: pregunta de si/no sin oferta declarada.
  assert(endsInYesNoQuestion('¿Te interesa ver los planos?'), 'A yes/no question must be detected');
  assert(!endsInYesNoQuestion('¿Cuál te muestro?'), 'An open question (cuál) must not be treated as yes/no');
  assert(!endsInYesNoQuestion('¿Dónde está ubicado?'), 'An open question (dónde) must not be treated as yes/no');
  assert(!endsInYesNoQuestion('Los modelos van desde $1,000,000.'), 'A statement without a question must not be flagged');

  assert(
    checkOfferDeclared('¿Te muestro los modelos?', null) !== null,
    'A yes/no question without a declared offer must be blocked'
  );
  assert(
    checkOfferDeclared('¿Te muestro los modelos?', 'modelo') === null,
    'A yes/no question with a declared offer must not be blocked'
  );
  assert(
    checkOfferDeclared('En Europa las casas van desde $1,850,000.', null) === null,
    'A response that does not ask must never be blocked by this rule'
  );

  // 9.2: respuesta que cruza ramas sin nombrarlas.
  assert(
    checkBranchesNamed('Hay Vento desde $2,340,000 y Cala desde $1,420,000.', ['Europa', 'Altabrisa']) !== null,
    'A response mixing two branches without naming them must be blocked'
  );
  assert(
    checkBranchesNamed('En Europa, Vento desde $2,340,000; en Altabrisa, Cala desde $1,420,000.', ['Europa', 'Altabrisa']) === null,
    'A response naming both branches must not be blocked'
  );
  assert(
    checkBranchesNamed('Modelo Vento desde $2,340,000.', ['Europa']) === null,
    'A response with facts from a single branch has nothing to name'
  );

  console.log('Compiler publish-blocking rules (pure) verification passed');
}

async function testRuntimeWiring() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || (!supabaseUrl.includes('127.0.0.1') && !supabaseUrl.includes('localhost'))) {
    console.error('NEXT_PUBLIC_SUPABASE_URL must point to the local stack');
    process.exit(1);
  }

  const { supabaseServer } = await import('../src/services/supabase/server-client');
  const { messageProcessor } = await import('../src/core/conversation/message-processor');
  const { scopeRepository, ROOT_SCOPE_ID } = await import('../src/data/repositories/scope.repository');
  const { intentDetectionService } = await import('../src/core/intent-engine/intent-detection.service');

  const suffix = Date.now().toString(36);
  const createdScopeIds: string[] = [];
  const createdIntentIds: string[] = [];
  const existingScopeStates: Array<{ id: string; is_active: boolean }> = [];
  const phone = `co${suffix}`;

  try {
    const { data: existing } = await supabaseServer
      .from('scopes').select('id, is_active').eq('parent_id', ROOT_SCOPE_ID).eq('is_active', true);
    existingScopeStates.push(...(existing || []));
    for (const row of existing || []) {
      await supabaseServer.from('scopes').update({ is_active: false }).eq('id', row.id);
    }
    scopeRepository.invalidateCache();

    const { data: dev, error: devError } = await supabaseServer.from('scopes').insert({
      name: `Dev${suffix}`, parent_id: ROOT_SCOPE_ID,
      slug: `dev-${suffix}`, scope_type: 'development', is_active: true,
    }).select('id').single();
    if (devError) throw devError;
    createdScopeIds.push(dev.id);
    scopeRepository.invalidateCache();

    const askKw = [`veroferta${suffix}`];
    const modelKw = [`modelosdev${suffix}`];
    const { data: intents, error: intentsError } = await supabaseServer
      .from('intent_configurations')
      .insert([
        { intent_name: 'oferta_planos', display_name: 'oferta', scope_id: dev.id, keywords: askKw, is_active: true },
        { intent_name: 'modelo', display_name: 'modelo', scope_id: dev.id, keywords: modelKw, is_active: true },
      ])
      .select('id, intent_name');
    if (intentsError) throw intentsError;
    createdIntentIds.push(...intents.map(i => i.id));

    const askIntent = intents.find(i => i.intent_name === 'oferta_planos')!;
    const modelIntent = intents.find(i => i.intent_name === 'modelo')!;
    const { error: responsesError } = await supabaseServer.from('bot_responses').insert([
      {
        intent_id: askIntent.id, response_key: 'main', response_type: 'simple',
        message_text: '¿Te muestro los modelos?', is_active: true, order_priority: 1,
        offers_intent_name: 'modelo',
      },
      {
        intent_id: modelIntent.id, response_key: 'main', response_type: 'simple',
        message_text: `modelos-de-dev-${suffix}`, is_active: true, order_priority: 1,
      },
    ]);
    if (responsesError) throw responsesError;
    scopeRepository.invalidateCache();
    intentDetectionService.invalidateAll();

    // La respuesta declarada registra la oferta.
    const ask = await messageProcessor.processMessage(phone, askKw[0], `t1-${suffix}`, 'Test');
    assert(!ask.isFallback, `The declaring question must answer normally: ${JSON.stringify(ask)}`);

    // 8.5-equivalente para una oferta compilada: "si" la ejecuta.
    const yes = await messageProcessor.processMessage(phone, 'sí', `t2-${suffix}`, 'Test');
    assert(
      yes.responses.some(r => typeof r === 'string' && r.includes(`modelos-de-dev-${suffix}`)),
      `A "sí" after a declared compiled offer must execute what it offers: ${JSON.stringify(yes)}`
    );

    console.log('Compiler declared-offer runtime wiring verification passed');
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

async function main() {
  await testPureRules();
  await testRuntimeWiring();
}

main().catch(error => {
  console.error('Compiler offer rules verification failed:', error);
  process.exit(1);
});
