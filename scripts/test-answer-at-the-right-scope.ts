/**
 * De quien es la respuesta que sale, y que pasa cuando no puede salir.
 *
 * Sin foco, la deteccion busca en todos los alcances a la vez y devuelve las
 * filas en el orden en que las encontro, que puede empezar por un
 * fraccionamiento. De esa lista sale una sola fila --la primera con
 * contenido-- asi que con la conversacion en la inmobiliaria contestaba la
 * fila de Europa.
 *
 * Y como el texto de Europa usa una variable del catalogo de Europa, en la
 * inmobiliaria no resolvia y la respuesta se descartaba entera: el lead recibia
 * "no entiendo tu pregunta" por una pregunta que el matcher habia acertado, con
 * los botones de la respuesta que nunca salio, y el panel decia "Intencion: no
 * detectada".
 *
 *   npx tsx scripts/test-answer-at-the-right-scope.ts
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
  const { conversationRepository } = await import('../src/data/repositories/conversation.repository');
  const { scopeRepository, ROOT_SCOPE_ID } = await import('../src/data/repositories/scope.repository');
  const { intentDetectionService } = await import('../src/core/intent-engine/intent-detection.service');
  const { offerButtons } = await import('../src/core/conversation/pending-offer-messages');

  const suffix = Date.now().toString(36);
  const phone = `ar${suffix}`;
  const createdScopes: string[] = [];
  const createdIntents: string[] = [];
  const createdValues: string[] = [];
  const previous: Array<{ id: string; is_active: boolean }> = [];

  const scope = async (name: string, aliases: string[]) => {
    const { data, error } = await supabaseServer.from('scopes').insert({
      name, parent_id: ROOT_SCOPE_ID, slug: `${name.toLowerCase()}-${suffix}`,
      scope_type: 'development', is_active: true,
    }).select('id').single();
    if (error) throw error;
    createdScopes.push(data.id);
    for (const alias of aliases) {
      await supabaseServer.from('scope_aliases').insert({
        scope_id: data.id, alias, normalized_alias: alias.toLowerCase(),
      });
    }
    return data.id as string;
  };

  const content = async (
    scopeId: string, intentName: string, keywords: string[], text: string, type = 'simple'
  ) => {
    const { data, error } = await supabaseServer.from('intent_configurations').insert({
      intent_name: intentName, display_name: intentName, scope_id: scopeId,
      keywords, synonyms: [], typos: [], phrases: [], priority: 10, is_active: true,
    }).select('id').single();
    if (error) throw error;
    createdIntents.push(data.id);
    const messageText = type === 'fragmented'
      ? { fragments: [{ type: 'text', delay: 0, content: text }] }
      : text;
    const { error: rerr } = await supabaseServer.from('bot_responses').insert({
      intent_id: data.id, response_key: 'main', response_type: type,
      message_text: messageText, is_active: true, order_priority: 1,
    });
    if (rerr) throw rerr;
    return data.id as string;
  };

  try {
    const { data: existing } = await supabaseServer
      .from('scopes').select('id, is_active').eq('parent_id', ROOT_SCOPE_ID).eq('is_active', true);
    previous.push(...(existing || []));
    for (const row of existing || []) {
      await supabaseServer.from('scopes').update({ is_active: false }).eq('id', row.id);
    }
    scopeRepository.invalidateCache();

    const europa = await scope(`ArEuropa${suffix}`, ['ArEuropa']);
    const malasia = await scope(`ArMalasia${suffix}`, ['ArMalasia']);
    scopeRepository.invalidateCache();

    // Un dato que solo existe en Europa: es lo que hace que su texto no pueda
    // salir en la inmobiliaria.
    const { data: value, error: valueError } = await supabaseServer.from('catalog_values').insert({
      scope_id: europa, value_key: `dato_${suffix}`, value: '700,000', value_type: 'text',
    }).select('id').single();
    if (valueError) throw valueError;
    createdValues.push(value.id);

    const kw = [`folletin${suffix}`];
    const intentName = `ar_brochure_${suffix}`;
    const idEuropa = await content(europa, intentName, kw, `Europa cuesta {dato_${suffix}}`, 'fragmented');
    const idMalasia = await content(malasia, intentName, kw, 'Malasia, texto propio', 'fragmented');
    const idRaiz = await content(ROOT_SCOPE_ID, intentName, kw, 'Texto de la INMOBILIARIA', 'fragmented');
    scopeRepository.invalidateCache();
    intentDetectionService.invalidateAll();

    // --- El orden que llega no manda: manda el alcance de la conversacion.
    // Se pasa Europa primero a proposito, que es como lo devuelve la deteccion
    // sin foco.
    const enRaiz = await conversationRepository.getBotResponses(
      [idEuropa, idMalasia, idRaiz], {}, ROOT_SCOPE_ID
    );
    assert(
      enRaiz.length === 1 && JSON.stringify(enRaiz[0]).includes('INMOBILIARIA'),
      `En la inmobiliaria contesta su fila, no la de un fraccionamiento: ${JSON.stringify(enRaiz)}`
    );

    const enEuropa = await conversationRepository.getBotResponses(
      [idRaiz, idMalasia, idEuropa], {}, europa
    );
    assert(
      enEuropa.length === 1 && JSON.stringify(enEuropa[0]).includes('700,000'),
      `En Europa contesta la de Europa, con su dato resuelto: ${JSON.stringify(enEuropa)}`
    );

    const enMalasia = await conversationRepository.getBotResponses(
      [idEuropa, idRaiz, idMalasia], {}, malasia
    );
    assert(
      enMalasia.length === 1 && JSON.stringify(enMalasia[0]).includes('Malasia, texto propio'),
      `En Malasia contesta la de Malasia: ${JSON.stringify(enMalasia)}`
    );

    // --- Y el turno completo, sin foco, contesta de verdad.
    const turn = await messageProcessor.processMessage(phone, kw[0], `ar1-${suffix}`, 'Test');
    assert(
      !turn.isFallback && turn.responses.length > 0,
      `Sin foco, una pregunta que la inmobiliaria contesta no debe caer al fallback: ${JSON.stringify(turn)}`
    );
    assert(
      JSON.stringify(turn.responses).includes('INMOBILIARIA'),
      `Y contesta la fila de la inmobiliaria: ${JSON.stringify(turn.responses)}`
    );

    // --- Cuando de verdad no hay nada que mandar: se dice cual era, y no se
    // dejan puestos los botones de una respuesta que no salio.
    const huecoKw = [`hueco${suffix}`];
    const huecoName = `ar_hole_${suffix}`;
    await content(ROOT_SCOPE_ID, huecoName, huecoKw, `Vale {no_existe_${suffix}}`, 'fragmented');
    scopeRepository.invalidateCache();
    intentDetectionService.invalidateAll();

    const hueco = await messageProcessor.processMessage(phone, huecoKw[0], `ar2-${suffix}`, 'Test');
    assert(hueco.isFallback, 'Una respuesta que no puede salir cae al fallback');
    assert(
      hueco.detectedIntent?.intent_name === huecoName,
      `Pero el turno dice cual era la intencion, no "no detectada": ${JSON.stringify(hueco.detectedIntent?.intent_name)}`
    );
    const userId = (await supabaseServer.from('users').select('id').eq('phone_number', phone).single()).data!.id;
    const botones = await offerButtons(userId, 'x');
    assert(
      botones.length === 0,
      `Y no deja los botones de la respuesta que nunca salio: ${JSON.stringify(botones)}`
    );

    console.log('Answer-at-the-right-scope verification passed');
  } finally {
    const { data: user } = await supabaseServer.from('users').select('id').eq('phone_number', phone).maybeSingle();
    if (user) {
      for (const table of ['conversations', 'user_scope_progress', 'appointments', 'followup_messages', 'user_sessions']) {
        await supabaseServer.from(table).delete().eq('user_id', user.id);
      }
      await supabaseServer.from('users').delete().eq('id', user.id);
    }
    for (const id of createdValues) await supabaseServer.from('catalog_values').delete().eq('id', id);
    for (const id of createdIntents) {
      await supabaseServer.from('bot_responses').delete().eq('intent_id', id);
      await supabaseServer.from('intent_configurations').delete().eq('id', id);
    }
    for (const id of createdScopes.reverse()) {
      await supabaseServer.from('scope_aliases').delete().eq('scope_id', id);
      await supabaseServer.from('scopes').delete().eq('id', id);
    }
    for (const row of previous) {
      await supabaseServer.from('scopes').update({ is_active: row.is_active ?? true }).eq('id', row.id);
    }
    scopeRepository.invalidateCache();
    intentDetectionService.invalidateAll();
  }
}

main().catch(error => {
  console.error('Answer-at-the-right-scope verification failed:', error);
  process.exit(1);
});
