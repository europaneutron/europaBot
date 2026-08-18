/**
 * Prueba dedicada a las secciones 3-6 de la spec `enumerated-disambiguation`
 * que `simulate-fymsa.ts` no ejercita explícitamente: enumeración acotada
 * por rama, formato botones/lista, lectura de la respuesta del lead (toque,
 * texto, elegir-y-preguntar-otra-cosa) y mención/saludo/hermanos.
 *
 *   npx tsx scripts/test-enumerated-disambiguation.ts
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
  const { currentOfferPresentation, offerButtons } = await import('../src/core/conversation/pending-offer-messages');
  const { chooseEnumerationFormat } = await import('../src/core/conversation/scope-enumeration.service');

  const suffix = Date.now().toString(36);
  const createdScopeIds: string[] = [];
  const createdIntentIds: string[] = [];
  const existingScopeStates: Array<{ id: string; is_active: boolean }> = [];
  const phone = `ed${suffix}`;

  const scope = async (name: string, parentId: string, aliases: string[]) => {
    const { data, error } = await supabaseServer.from('scopes').insert({
      name, parent_id: parentId,
      slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${suffix}`,
      scope_type: 'development', is_active: true,
    }).select('id').single();
    if (error) throw error;
    createdScopeIds.push(data.id);
    for (const alias of aliases) {
      await supabaseServer.from('scope_aliases').insert({ scope_id: data.id, alias, normalized_alias: alias.toLowerCase() });
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

    // Los alias no llevan el sufijo: la coincidencia difusa compara contra
    // toda la cadena, y varios alias con la misma cola de sufijo se
    // confunden entre sí. Los nombres bastan para ser únicos dentro de esta
    // corrida, y el finally limpia todo al terminar.
    const devA = await scope(`DevA${suffix}`, ROOT_SCOPE_ID, ['DevA', 'Europa']);
    const devB = await scope(`DevB${suffix}`, ROOT_SCOPE_ID, ['DevB', 'Cala']);
    // Cinco modelos en devA: dispara el formato de lista (4-10) al preguntar
    // por su precio.
    const modelAliases = ['ModelOne', 'ModelTwo', 'ModelThree', 'ModelFour', 'ModelFive'];
    const models = await Promise.all(
      [1, 2, 3, 4, 5].map(n => scope(`Model${n}${suffix}`, devA, [modelAliases[n - 1]]))
    );
    scopeRepository.invalidateCache();

    const priceKw = [`precio${suffix}`];
    const locKw = [`ubicados${suffix}`];
    await content(devA, 'precio', priceKw, `DevA general ${suffix}`);
    await content(devB, 'precio', priceKw, `DevB general ${suffix}`);
    await content(devA, 'ubicacion', locKw, `DevA direccion ${suffix}`);
    await content(devB, 'ubicacion', locKw, `DevB direccion ${suffix}`);
    for (let i = 0; i < models.length; i++) {
      await content(models[i], 'precio', priceKw, `Model${i + 1} precio ${suffix}`);
    }
    scopeRepository.invalidateCache();
    intentDetectionService.invalidateAll();

    // --- 4.4 / 3.5: dos desarrollos como botones (precio sin foco).
    // Los mensajes de la enumeración son de ruteo, y los mensajes de ruteo se
    // editan desde Ajustes. Vivían solo como valor por omisión en código.
    const ENUMERATION_MESSAGE_KEYS = [
      'scope_disambiguation_message',
      'scope_disambiguation_followup_message',
      'scope_next_level_message',
      'scope_only_presentation_message',
      'sibling_message',
      'sibling_up_message',
      'sibling_none_message',
      'pending_offer_repeat_message',
      'unanchored_affirmative_message',
    ];
    const { data: configuredMessages, error: configuredMessagesError } = await supabaseServer
      .from('bot_config')
      .select('config_key, is_editable')
      .in('config_key', ENUMERATION_MESSAGE_KEYS);
    if (configuredMessagesError) throw configuredMessagesError;
    const editableKeys = new Set(
      (configuredMessages || []).filter(row => row.is_editable).map(row => row.config_key)
    );
    const missingKeys = ENUMERATION_MESSAGE_KEYS.filter(key => !editableKeys.has(key));
    assert(
      missingKeys.length === 0,
      `Every enumeration message must be editable from settings; missing: ${missingKeys.join(', ')}`
    );

    const twoBranchTurn = await messageProcessor.processMessage(
      phone, `precio${suffix}`, `t1-${suffix}`, 'Test'
    );
    assert(!twoBranchTurn.isFallback, 'Two-branch price question must not fall back');
    const userId = (await supabaseServer.from('users').select('id').eq('phone_number', phone).single()).data!.id;
    let session = await userRepository.getSession(userId);
    assert(session?.pending_offer_options?.length === 2, `Two branches must offer exactly two options: ${JSON.stringify(session?.pending_offer_options)}`);
    let presentation = await currentOfferPresentation(userId, 'x');
    assert(presentation?.format === 'buttons', `Two options must present as buttons: ${JSON.stringify(presentation)}`);
    assert(chooseEnumerationFormat(2) === 'buttons', 'chooseEnumerationFormat(2) must be buttons');

    // El transporte cambia, lo que se ofrece no: el simulador del panel no
    // distingue botones de lista, pero tiene que recibir las mismas opciones
    // que WhatsApp. Sin esto enseñaba la pregunta pelada.
    const simulatorButtons = await offerButtons(userId, 'x');
    assert(
      simulatorButtons.length === 2
      && simulatorButtons.every(button => button.id && button.title),
      `The simulator must receive the same options as WhatsApp: ${JSON.stringify(simulatorButtons)}`
    );

    // --- 5.4: escribir el nombre de una opción ofrecida la elige, y solo
    // trae modelos de esa rama (3.5). Es el nombre del alcance (la etiqueta
    // de la opción), no su alias registrado: son mecanismos distintos.
    const chooseDevA = await messageProcessor.processMessage(
      phone, `DevA${suffix}`, `t2-${suffix}`, 'Test'
    );
    assert(chooseDevA.scopeId === devA, `Typing an offered option's name must select it: ${JSON.stringify(chooseDevA)}`);
    assert(
      chooseDevA.responses.some(r => typeof r === 'string' && r.includes(`DevA general ${suffix}`)),
      'Choosing an option must resume the original pending question'
    );

    // --- 4.4: cinco modelos como lista, al preguntar el precio con foco en
    // devA (los modelos tienen precio propio distinto).
    const fiveModelsTurn = await messageProcessor.processMessage(
      phone, `precio${suffix}`, `t3-${suffix}`, 'Test'
    );
    session = await userRepository.getSession(userId);
    assert(session?.pending_offer_options?.length === 5, `Five models must offer five options: ${JSON.stringify(session?.pending_offer_options)}`);
    assert(
      session!.pending_offer_options!.every(o => models.includes(o.scopeId)),
      'The five options must all belong to devA, none from devB'
    );
    presentation = await currentOfferPresentation(userId, 'x');
    assert(presentation?.format === 'list', `Five options must present as a list: ${JSON.stringify(presentation)}`);
    assert(chooseEnumerationFormat(5) === 'list', 'chooseEnumerationFormat(5) must be list');
    void fiveModelsTurn;

    // --- 5.5: elegir una opción escribiendo su nombre (contra la oferta de
    // cinco modelos, todavía viva) y preguntar algo distinto en el mismo
    // mensaje contesta lo nuevo, no la retenida.
    const model1Id = models[0];
    const typeAndAsk = await messageProcessor.processMessage(
      phone, `Model1${suffix} ${locKw[0]}`, `t4b-${suffix}`, 'Test'
    );
    assert(typeAndAsk.scopeId === model1Id, `Naming an option and asking something new must still select it: ${JSON.stringify(typeAndAsk)}`);
    assert(
      typeAndAsk.responses.some(r => typeof r === 'string' && r.includes(`DevA direccion ${suffix}`)),
      `Asking something new in the same message must answer the new question, not the retained one: ${JSON.stringify(typeAndAsk.responses)}`
    );

    // --- 5.2: un toque (el identificador puro, sin texto alrededor) fija el
    // foco sin pasar por el matcher difuso. Se regenera una oferta viva
    // saludando (suelta el foco) y volviendo a preguntar el precio.
    await messageProcessor.processMessage(phone, 'hola', `t4c-${suffix}`, 'Test');
    await messageProcessor.processMessage(phone, `precio${suffix}`, `t4d-${suffix}`, 'Test');
    const tap = await messageProcessor.processMessage(phone, devA, `t4e-${suffix}`, 'Test');
    assert(tap.scopeId === devA, `Tapping an option id must set focus to it directly: ${JSON.stringify(tap)}`);

    // --- 6.4: pedir alternativas con foco enumera los hermanos. Se fija el
    // foco y la última pregunta contestada en un solo mensaje (mención +
    // pregunta), para no depender de una desambiguación de precio todavía
    // pendiente de un paso anterior.
    const focusModel2 = await messageProcessor.processMessage(
      phone, `ModelTwo ${locKw[0]}`, `t5-${suffix}`, 'Test'
    );
    assert(focusModel2.scopeId === models[1], `Mentioning a sibling and asking must move focus there: ${JSON.stringify(focusModel2)}`);
    const askOthers = await messageProcessor.processMessage(
      phone, 'que mas tienen', `t6-${suffix}`, 'Test'
    );
    session = await userRepository.getSession(userId);
    const siblingIds = session?.pending_offer_options?.map(o => o.scopeId) ?? [];
    assert(
      siblingIds.length === models.length - 1 && !siblingIds.includes(models[1]),
      `Asking for others must enumerate the siblings of the focused model, not itself: ${JSON.stringify(siblingIds)}`
    );
    void askOthers;

    // --- 6.6: "y el de Cala" con foco en un modelo cambia de foco y repite
    // la última pregunta contestada (ubicación, del paso anterior). "Pedir
    // otro" no cuenta como pregunta contestada: no toca `last_intent_detected`.
    const mentionSibling = await messageProcessor.processMessage(
      phone, 'y el de Cala', `t7-${suffix}`, 'Test'
    );
    assert(mentionSibling.scopeId === devB, `Mentioning another branch by alias must move focus there: ${JSON.stringify(mentionSibling)}`);
    assert(
      mentionSibling.responses.some(r => typeof r === 'string' && r.includes(`DevB direccion ${suffix}`)),
      `A bare mention must repeat the last answered question at the new focus: ${JSON.stringify(mentionSibling.responses)}`
    );

    // --- 6.3 / 6.7: saludar suelta el foco, la pregunta retenida, y vuelve
    // a ofrecer los desarrollos.
    const greet = await messageProcessor.processMessage(phone, 'hola', `t8-${suffix}`, 'Test');
    assert(greet.scopeId === ROOT_SCOPE_ID, `Greeting must clear focus back to root: ${JSON.stringify(greet)}`);
    assert(
      greet.responses.some(r => typeof r === 'string' && r.includes('DevA') && r.includes('DevB')),
      `Greeting after losing focus must offer the developments again: ${JSON.stringify(greet.responses)}`
    );
    session = await userRepository.getSession(userId);
    assert(!session?.current_scope_id, 'Greeting must clear the persisted scope focus');
    assert(!session?.pending_scope_message, 'Greeting must clear the retained question');

    // --- 6.5: mencionar un alcance dentro de una frase ("me interesa X"),
    // no solo a secas, también fija el foco y repite la última pregunta.
    await messageProcessor.processMessage(phone, `precio${suffix}`, `t9-${suffix}`, 'Test');
    const mentionInSentence = await messageProcessor.processMessage(
      phone, 'me interesa Europa', `t10-${suffix}`, 'Test'
    );
    assert(mentionInSentence.scopeId === devA, `A mention embedded in a sentence must still set focus: ${JSON.stringify(mentionInSentence)}`);
    assert(
      mentionInSentence.responses.some(r => typeof r === 'string' && r.includes(`DevA general ${suffix}`)),
      `It must answer the retained question at the new focus: ${JSON.stringify(mentionInSentence.responses)}`
    );

    // --- Mencionar un alcance repite la última pregunta, pero `cita` no es
    // una pregunta: es un flujo que arranca. Un lead que agenda, cancela y
    // luego nombra un desarrollo recibía otra vez "¿qué día te gustaría
    // visitarnos?", sin haberlo pedido.
    await messageProcessor.processMessage(phone, 'hola', `t11-${suffix}`, 'Test');
    await messageProcessor.processMessage(phone, 'quiero agendar una visita', `t12-${suffix}`, 'Test');
    await messageProcessor.processMessage(phone, 'cancelar', `t13-${suffix}`, 'Test');
    session = await userRepository.getSession(userId);
    assert(
      session?.last_intent_detected === 'cita',
      `The scenario needs the appointment intent as the last one answered: ${session?.last_intent_detected}`
    );
    const mentionAfterFlow = await messageProcessor.processMessage(
      phone, 'Cala', `t14-${suffix}`, 'Test'
    );
    assert(
      mentionAfterFlow.scopeId === devB,
      `A bare mention after a flow must still set focus: ${JSON.stringify(mentionAfterFlow)}`
    );
    assert(
      !mentionAfterFlow.responses.some(r => typeof r === 'string' && r.includes('agendar tu visita')),
      `A bare mention must not restart the appointment flow: ${JSON.stringify(mentionAfterFlow.responses)}`
    );

    // Saludar tampoco es una pregunta que repetir, y ademas suelta el foco:
    // repetirlo al mencionar un alcance tiraba el foco que la mencion acababa
    // de fijar. "hola" y luego "me interesa Europa" devolvia el saludo entero.
    await messageProcessor.processMessage(phone, 'hola', `t15-${suffix}`, 'Test');
    session = await userRepository.getSession(userId);
    assert(
      session?.last_intent_detected === 'saludo',
      `The scenario needs the greeting as the last intent answered: ${session?.last_intent_detected}`
    );
    const mentionAfterGreeting = await messageProcessor.processMessage(
      phone, 'Europa', `t16-${suffix}`, 'Test'
    );
    assert(
      mentionAfterGreeting.scopeId === devA,
      `A mention after a greeting must set focus, not replay the greeting: ${JSON.stringify(mentionAfterGreeting)}`
    );
    assert(
      mentionAfterGreeting.detectedIntent?.intent_name !== 'saludo',
      `A mention must not repeat the greeting: ${JSON.stringify(mentionAfterGreeting.responses)}`
    );

    console.log('Enumerated disambiguation verification passed');
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
  console.error('Enumerated disambiguation verification failed:', error);
  process.exit(1);
});
