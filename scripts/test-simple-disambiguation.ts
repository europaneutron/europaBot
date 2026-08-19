/**
 * Las dos reglas que dejan de adivinar.
 *
 * 1. Si el nivel donde esta la conversacion ya tiene respuesta propia, se
 *    manda. Antes el bot preguntaba "¿de cual te platico?" mirando una sola
 *    cosa --si dos desarrollos pueden contestar-- y nunca miraba si el nivel
 *    de la conversacion contestaba por si mismo, asi que descartaba en
 *    silencio lo que el cliente habia escrito para ese momento.
 *
 * 2. Pedir otro con un solo hermano cambia el foco, no pregunta. Un boton no
 *    es una eleccion: el bot enseñaba la unica respuesta posible y esperaba a
 *    que la tocaran para hacer justo lo que ya iba a hacer.
 *
 *   npx tsx scripts/test-simple-disambiguation.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.development.local') });
config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!supabaseUrl || !/^http:\/\/(127\.0\.0\.1|localhost):/.test(supabaseUrl)) {
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
  const phone = `sd${suffix}`;

  const scope = async (name: string, parentId: string, aliases: string[]) => {
    const { data, error } = await supabaseServer.from('scopes').insert({
      name, parent_id: parentId,
      slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${suffix}`,
      scope_type: 'development', is_active: true,
    }).select('id').single();
    if (error) throw error;
    createdScopeIds.push(data.id);
    for (const alias of aliases) {
      await supabaseServer.from('scope_aliases').insert({
        scope_id: data.id, alias, normalized_alias: alias.toLowerCase(),
      });
    }
    return data.id as string;
  };

  const content = async (scopeId: string, intentName: string, keywords: string[], text: string) => {
    const { data: intent, error } = await supabaseServer.from('intent_configurations').insert({
      intent_name: intentName, display_name: intentName, scope_id: scopeId,
      keywords, synonyms: [], typos: [], phrases: [], priority: 10, is_active: true,
    }).select('id').single();
    if (error) throw error;
    createdIntentIds.push(intent.id);
    const { error: respError } = await supabaseServer.from('bot_responses').insert({
      intent_id: intent.id, response_key: 'main', response_type: 'simple',
      message_text: text, is_active: true, order_priority: 1,
    });
    if (respError) throw respError;
  };

  try {
    const { data: existing } = await supabaseServer
      .from('scopes').select('id, is_active').eq('parent_id', ROOT_SCOPE_ID).eq('is_active', true);
    existingScopeStates.push(...(existing || []));
    for (const row of existing || []) {
      await supabaseServer.from('scopes').update({ is_active: false }).eq('id', row.id);
    }
    scopeRepository.invalidateCache();

    const devA = await scope(`SdA${suffix}`, ROOT_SCOPE_ID, ['Sierra']);
    const devB = await scope(`SdB${suffix}`, ROOT_SCOPE_ID, ['Cumbre']);
    scopeRepository.invalidateCache();

    // `alberca` lo contestan solo los dos desarrollos: hay duda de verdad.
    // `mascotas` lo contesta ademas la raiz: ahi no hay nada que preguntar.
    //
    // Nombres fuera del kit base a proposito: `precio` viene sembrado en la
    // raiz por la migracion 002, asi que con la regla nueva ya no pregunta.
    const priceKw = [`alberca${suffix}`];
    const petsKw = [`perritos${suffix}`];
    await content(devA, 'alberca', priceKw, `SdA alberca ${suffix}`);
    await content(devB, 'alberca', priceKw, `SdB alberca ${suffix}`);
    await content(ROOT_SCOPE_ID, 'mascotas', petsKw, `Se admiten mascotas ${suffix}`);
    await content(devA, 'mascotas', petsKw, `SdA mascotas ${suffix}`);
    await content(devB, 'mascotas', petsKw, `SdB mascotas ${suffix}`);
    scopeRepository.invalidateCache();
    intentDetectionService.invalidateAll();

    // --- Regla 1a: sin respuesta propia en la raiz, la duda es real.
    const ambiguous = await messageProcessor.processMessage(
      phone, priceKw[0], `s1-${suffix}`, 'Test'
    );
    const userId = (await supabaseServer.from('users').select('id').eq('phone_number', phone).single()).data!.id;
    let session = await userRepository.getSession(userId);
    assert(
      session?.pending_offer_options?.length === 2,
      `Two developments answering and nothing at the level must still ask: ${JSON.stringify(session?.pending_offer_options)}`
    );
    assert(!ambiguous.isFallback, 'The ambiguous question must not fall back');

    // Un solo mensaje, no un adelanto mas una coletilla.
    assert(
      ambiguous.responses.length === 1,
      `Disambiguation must be a single message: ${JSON.stringify(ambiguous.responses)}`
    );

    // --- Regla 1b: con respuesta propia en la raiz, se manda esa.
    await messageProcessor.processMessage(phone, 'hola', `s2-${suffix}`, 'Test');
    const answered = await messageProcessor.processMessage(
      phone, petsKw[0], `s3-${suffix}`, 'Test'
    );
    assert(
      answered.responses.some(r => typeof r === 'string' && r.includes(`Se admiten mascotas ${suffix}`)),
      `A level with its own answer must send it instead of asking which: ${JSON.stringify(answered.responses)}`
    );

    // --- Regla 2: con un solo hermano, pedir otro cambia el foco.
    // Se fija el foco en SdA nombrandolo con una pregunta.
    const focusA = await messageProcessor.processMessage(
      phone, `Sierra ${priceKw[0]}`, `s4-${suffix}`, 'Test'
    );
    assert(focusA.scopeId === devA, `Naming a development must focus it: ${JSON.stringify(focusA)}`);

    const other = await messageProcessor.processMessage(phone, 'y el otro', `s5-${suffix}`, 'Test');
    assert(
      other.scopeId === devB,
      `With a single sibling, asking for the other must switch focus, not offer one button: ${JSON.stringify(other)}`
    );
    session = await userRepository.getSession(userId);
    assert(
      session?.current_scope_id === devB,
      `The focus change must persist: ${session?.current_scope_id}`
    );
    assert(
      !session?.pending_offer_options?.length,
      `A single sibling must not leave a one-option offer hanging: ${JSON.stringify(session?.pending_offer_options)}`
    );

    console.log('Simple disambiguation verification passed');
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
    for (const intentId of createdIntentIds) {
      await supabaseServer.from('bot_responses').delete().eq('intent_id', intentId);
      await supabaseServer.from('intent_configurations').delete().eq('id', intentId);
    }
    for (const scopeId of createdScopeIds.reverse()) {
      await supabaseServer.from('scope_aliases').delete().eq('scope_id', scopeId);
      await supabaseServer.from('scopes').delete().eq('id', scopeId);
    }
    for (const row of existingScopeStates) {
      await supabaseServer.from('scopes').update({ is_active: row.is_active ?? true }).eq('id', row.id);
    }
    scopeRepository.invalidateCache();
    intentDetectionService.invalidateAll();
  }
}

main().catch(error => {
  console.error('Simple disambiguation verification failed:', error);
  process.exit(1);
});
