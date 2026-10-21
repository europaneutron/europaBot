/**
 * Bifurcación del camino con IA en el procesador (conversacion-con-ia, tareas 9.1 a 9.4).
 *
 * Parte 1, sin API ni base: interruptor, lista de teléfonos, flujos activos, oferta de cita y
 * `afterSend` del manejador con dependencias falsas.
 * Parte 2, contra el Supabase local y la API real (se omite sin ANTHROPIC_API_KEY): crea un
 * usuario desechable, inyecta el interruptor al procesador sin tocar `bot_config` y lo borra
 * al terminar. No modifica contenido.
 *
 *   npx tsx scripts/test-ai-switch.ts
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import { assertLocalSupabase } from './helpers/fymsa-fixture';
import {
  decideAiAccess, decideAiFlow, parseAllowedPhones, phonesMatch, type AiPathGateDependencies,
} from '../src/core/ai-conversation/ai-path';
import { handleAiMessage, type AiHandlerDependencies, type AiMessageInput } from '../src/core/ai-conversation/ai-message-handler';
import { parseResponderConfig } from '../src/services/anthropic/client';
import type { AiContext } from '../src/core/ai-conversation/responder';
import type { ClassificationDependencies } from '../src/core/ai-conversation/classification-pipeline';

config({ quiet: true, path: resolve(process.cwd(), '.env.development.local') });
config({ quiet: true, path: resolve(process.cwd(), '.env.local') });

let failed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  try { await fn(); console.log(`  ok  ${name}`); }
  catch (error) { failed++; console.error(`  FALLA ${name}\n       ${error instanceof Error ? error.message : error}`); }
}
async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.error;
  console.error = () => {};
  try { return await fn(); } finally { console.error = original; }
}

function gate(overrides: Partial<{ enabled: boolean; phones: string; flow: string | null; awaiting: boolean }> = {}) {
  const state = { enabled: true, phones: '[]', flow: null as string | null, awaiting: false, ...overrides };
  const reads: string[] = [];
  const deps: AiPathGateDependencies = {
    settings: async () => { reads.push('settings'); return { enabled: state.enabled, allowedPhonesRaw: state.phones }; },
    appointmentFlowState: async () => { reads.push('flow'); return state.flow; },
    awaitingAdvisorName: async () => { reads.push('awaiting'); return state.awaiting; },
  };
  return { deps, reads };
}
async function decide(phone: string, flowResponse: boolean, overrides: Parameters<typeof gate>[0] = {}) {
  const { deps, reads } = gate(overrides);
  const access = await quietly(() => decideAiAccess(phone, deps));
  const decision = access.use ? await decideAiFlow('user', flowResponse, deps) : access;
  return { reason: decision.use ? 'ai' : decision.reason, reads };
}

const developments = [
  { id: 'europa', name: 'Europa', hasResources: true, hasAppointments: true },
  { id: 'altabrisa', name: 'Altabrisa', hasResources: false, hasAppointments: false },
];
const context: AiContext = {
  systemPrompt: 'Persona y catálogo estable.', contextSizeChars: 27, developments,
  developmentNames: ['Altabrisa', 'Europa'], moneyValues: [], catalogBlocks: [], excluded: [],
};
const input: AiMessageInput = {
  userId: 'user', phoneNumber: '525500000000', messageId: 'msg', messageText: 'Hola',
  facts: { now: new Date('2026-10-20T12:00:00Z'), hasActiveAppointment: false, shouldOfferAppointment: false },
  suppressExternalMessages: true,
};
function reply(text: string): Anthropic.Message {
  return {
    id: 'r', type: 'message', role: 'assistant', model: 'claude-haiku-5-5',
    content: [{ type: 'text', text, citations: null }],
    stop_reason: 'end_turn', stop_sequence: null, stop_details: null, container: null, diagnostics: null,
    usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, cache_creation: null, inference_geo: null, server_tool_use: null, service_tier: 'standard', output_tokens_details: null, speed: null },
  };
}

function handlerHarness(options: { fail?: boolean; scoreSource?: 'matcher' | 'classifier'; matcherDelayMs?: number } = {}) {
  const sent: string[] = [];
  const offer = { evaluated: 0, marked: 0, result: true as boolean | Error };
  const scoring = { rows: [] as Array<{ failure_reason: string | null }>, marks: [] as string[] };
  let saved = 0;
  const classification: ClassificationDependencies = {
    // Sin configuración válida el clasificador "falla" y queda solo el matcher.
    config: async () => { throw new Error('sin configuración'); },
    scoreSource: async () => options.scoreSource ?? 'matcher',
    topics: async () => [],
    matcher: async () => {
      await new Promise(done => setTimeout(done, options.matcherDelayMs ?? 0));
      return { topics: ['precio'], top: { intentName: 'precio', isCheckpoint: true } };
    },
    client: { create: async () => { throw new Error('no se usa'); } },
    log: async () => {},
    rootScopeId: 'root',
    scoring: {
      saveClassification: async row => { scoring.rows.push(row); },
      isCheckpointCompleted: async () => false,
      markCheckpoint: async (_u, _s, intent) => { scoring.marks.push(intent); },
      recalculate: async () => {},
    },
  };
  const deps: AiHandlerDependencies = {
    config: async () => parseResponderConfig({}), context: async () => context,
    hasIncoming: async () => saved > 0, countMessages: async () => 0, history: async () => [],
    saveIncoming: async () => { saved++; },
    client: { create: async params => {
      sent.push(JSON.stringify(params.messages.at(-1)));
      if (options.fail) throw new Anthropic.APIConnectionError({ message: 'caída' });
      return reply('Con gusto.');
    } },
    log: async () => {},
    tools: {
      loadDevelopments: async () => developments,
      appointment: async () => { throw new Error('no se usa'); },
      advisor: async () => { throw new Error('no se usa'); },
      brochure: async () => [],
    },
    classification,
    offer: {
      evaluate: async () => { offer.evaluated++; if (offer.result instanceof Error) throw offer.result; return offer.result; },
      mark: async () => { offer.marked++; },
    },
  };
  return { deps, sent, offer, scoring, saved: () => saved };
}

async function pureChecks() {
  console.log('\nInterruptor y lista de teléfonos');
  await check('apagado: nunca, y no se lee nada más que el interruptor', async () => {
    const result = await decide('525500000000', false, { enabled: false });
    assert.equal(result.reason, 'disabled');
    assert.deepEqual(result.reads, ['settings']);
  });
  await check('encendido con lista vacía: todos', async () => assert.equal((await decide('525512345678', false)).reason, 'ai'));
  await check('encendido con lista: solo los de la lista', async () => {
    const phones = JSON.stringify(['+52 55 1234 5678', 5215599999999]);
    assert.equal((await decide('525512345678', false, { phones })).reason, 'ai');
    assert.equal((await decide('5215512345678', false, { phones })).reason, 'ai', 'mismo número con el 1 de Meta');
    assert.equal((await decide('525599999999', false, { phones })).reason, 'ai');
    assert.equal((await decide('525511111111', false, { phones })).reason, 'phone_not_allowed');
  });
  await check('lista que no es JSON o no es arreglo: nadie, no todos', async () => {
    assert.equal((await decide('525512345678', false, { phones: 'no json' })).reason, 'invalid_allowlist');
    assert.equal((await decide('525512345678', false, { phones: '{"a":1}' })).reason, 'invalid_allowlist');
  });
  await check('comparación de teléfonos', () => {
    assert(phonesMatch('525512345678', '5512345678'));
    assert(!phonesMatch('5512345678', '5512345679'));
    assert(!phonesMatch('', '5512345678'));
    assert.deepEqual(parseAllowedPhones(''), []);
    assert.deepEqual(parseAllowedPhones('[" 1 ", 2, ""]'), ['1', '2']);
  });

  console.log('\nFlujos activos ceden el turno al camino léxico');
  await check('respuesta de WhatsApp Flow', async () => assert.equal((await decide('525512345678', true)).reason, 'flow_response'));
  await check('flujo de cita en curso, incluida la oferta pendiente del bot léxico', async () => {
    for (const flow of ['ask_date', 'ask_time', 'confirm_date', 'pending_auto_offer']) {
      assert.equal((await decide('525512345678', false, { flow })).reason, 'appointment_flow', flow);
    }
    assert.equal((await decide('525512345678', false, { flow: 'completed' })).reason, 'ai');
  });
  await check('captura del nombre para el asesor', async () => assert.equal((await decide('525512345678', false, { awaiting: true })).reason, 'awaiting_advisor_name'));
  await check('precedencia: teléfono fuera de lista gana a un flujo y no lee el flujo', async () => {
    const result = await decide('525511111111', true, { phones: '["525500000001"]', flow: 'ask_date', awaiting: true });
    assert.equal(result.reason, 'phone_not_allowed');
    assert.deepEqual(result.reads, ['settings']);
  });

  console.log('\nManejador: oferta de cita');
  await check('oferta verdadera: nota solo en este turno, marca una vez', async () => {
    const h = handlerHarness();
    const result = await quietly(() => handleAiMessage(input, h.deps));
    assert.equal(result.kind, 'response');
    assert.equal(h.offer.evaluated, 1);
    assert.equal(h.offer.marked, 1);
    assert(h.sent[0].includes('le propones la visita'), h.sent[0]);
  });
  await check('oferta falsa: sin nota y sin marca', async () => {
    const h = handlerHarness(); h.offer.result = false;
    await quietly(() => handleAiMessage(input, h.deps));
    assert(!h.sent[0].includes('le propones la visita'));
    assert.equal(h.offer.marked, 0);
  });
  await check('sin desarrollo con horarios: ni nota ni marca aunque la política diga que sí', async () => {
    const h = handlerHarness();
    h.deps.context = async () => ({ ...context, developments: developments.map(item => ({ ...item, hasAppointments: false })) });
    await quietly(() => handleAiMessage(input, h.deps));
    assert(!h.sent[0].includes('le propones la visita'));
    assert.equal(h.offer.marked, 0);
  });
  await check('la evaluación que falla deja salir el turno sin oferta', async () => {
    const h = handlerHarness(); h.offer.result = new Error('base caída');
    const result = await quietly(() => handleAiMessage(input, h.deps));
    assert.equal(result.kind, 'response');
    assert.equal(h.offer.marked, 0);
  });
  await check('respaldo del contestador: no se marca la oferta ni se guarda la entrada', async () => {
    const h = handlerHarness({ fail: true });
    const result = await handleAiMessage(input, h.deps);
    assert.equal(result.kind, 'fallback');
    assert.equal(h.offer.marked, 0);
    assert.equal(h.saved(), 0);
  });

  console.log('\nManejador: afterSend');
  await check('la respuesta sale antes de que termine la clasificación, y afterSend la completa', async () => {
    const h = handlerHarness({ matcherDelayMs: 250 });
    const started = Date.now();
    const result = await quietly(() => handleAiMessage(input, h.deps));
    assert.equal(result.kind, 'response');
    assert(Date.now() - started < 200, 'el manejador esperó a la clasificación');
    assert.equal(h.scoring.rows.length, 0, 'la fila ya estaba escrita: no hay nada que esperar');
    assert(result.kind === 'response' && result.response.afterSend, 'sin afterSend');
    await result.response.afterSend;
    assert.equal(h.scoring.rows.length, 1);
    assert.equal(h.scoring.rows[0].failure_reason, 'config_error');
    assert.deepEqual(h.scoring.marks, ['precio'], 'fuente matcher: puntúa su coincidencia');
  });
  await check('fuente classifier con clasificador caído: puntúa con el matcher y lo registra', async () => {
    const h = handlerHarness({ scoreSource: 'classifier' });
    const result = await quietly(() => handleAiMessage(input, h.deps));
    assert(result.kind === 'response' && result.response.afterSend);
    await result.response.afterSend;
    assert.equal(h.scoring.rows[0].failure_reason, 'config_error+score_from_matcher');
    assert.deepEqual(h.scoring.marks, ['precio']);
  });
  await check('respaldo: afterSend viaja con el fallback y no puntúa', async () => {
    const h = handlerHarness({ fail: true, scoreSource: 'classifier' });
    const result = await quietly(() => handleAiMessage(input, h.deps));
    assert(result.kind === 'fallback' && result.afterSend);
    await result.afterSend;
    assert.equal(h.scoring.rows.length, 1);
    assert.equal(h.scoring.marks.length, 0);
  });
  await check('duplicado: sin llamada nueva', async () => {
    const h = handlerHarness();
    await quietly(() => handleAiMessage(input, h.deps));
    const calls = h.sent.length;
    assert.deepEqual(await handleAiMessage(input, h.deps), { kind: 'duplicate' });
    assert.equal(h.sent.length, calls);
  });
}

async function integrationChecks() {
  assertLocalSupabase();
  if (!process.env.ANTHROPIC_API_KEY) { console.log('\nParte 2 omitida: falta ANTHROPIC_API_KEY.'); return; }
  console.log('\nProcesador con base local y API real (usuario desechable)');
  const { MessageProcessor } = await import('../src/core/conversation/message-processor');
  const { userRepository } = await import('../src/data/repositories/user.repository');
  const { aiModelCallRepository } = await import('../src/data/repositories/ai-model-call.repository');
  const { aiTopicClassificationRepository } = await import('../src/data/repositories/ai-topic-classification.repository');
  const { scopeRepository, ROOT_SCOPE_ID } = await import('../src/data/repositories/scope.repository');
  const { supabaseServer } = await import('../src/services/supabase/server-client');
  const { isFragmentedResponse, isSimpleResponseWithMedia } = await import('../src/types/message-fragments.types');

  const phone = `52999${Date.now().toString().slice(-7)}`;
  const suffix = randomUUID().slice(0, 6);
  const gateState = { enabled: false, phones: '[]' };
  const processor = new MessageProcessor({
    settings: async () => ({ enabled: gateState.enabled, allowedPhonesRaw: gateState.phones }),
    appointmentFlowState: userId => userRepository.getAppointmentFlowState(userId),
    awaitingAdvisorName: userId => userRepository.isAwaitingAdvisorName(userId),
  });
  const send = async (text: string, id: string) => {
    const result = await processor.processMessage(phone, text, id, 'Prueba interruptor', { suppressExternalMessages: true });
    if (!result.viaAi && gateState.enabled && gateState.phones.includes(phone) && !id.endsWith('fallback') && !id.endsWith('flow')) {
      // Un respaldo inesperado se explica con la causa registrada, no con un assert mudo.
      const calls = await aiModelCallRepository.listForMessage(id);
      console.error(`       respaldo en "${text}": ${JSON.stringify(calls.map(call => [call.call_type, call.fallback_reason, call.error_type]))}`);
    }
    return result;
  };
  const countIncoming = async (messageId: string) => {
    const { count, error } = await supabaseServer.from('conversations').select('id', { count: 'exact', head: true }).eq('message_id', messageId);
    if (error) throw error;
    return count ?? 0;
  };
  const sessionRow = async (userId: string) => {
    const { data, error } = await supabaseServer.from('user_sessions').select('*').eq('user_id', userId).single();
    if (error) throw error;
    const row = { ...(data as Record<string, unknown>) };
    delete row.updated_at;
    return row;
  };
  let userId: string | null = null;
  try {
    const user = await userRepository.findOrCreateByPhone(phone, 'Prueba interruptor');
    userId = user.id;

    await check('apagado: camino léxico, una sola entrada guardada y ninguna llamada al modelo', async () => {
      const id = `wamid.sw-${suffix}-off`;
      const result = await send('Hola', id);
      assert(!result.viaAi && !result.afterSend);
      assert.equal(await countIncoming(id), 1);
      assert.equal((await aiModelCallRepository.listForMessage(id)).length, 0);
    });

    gateState.enabled = true;
    gateState.phones = JSON.stringify(['525500000001']);
    await check('encendido para otra lista: camino léxico', async () => {
      const id = `wamid.sw-${suffix}-other`;
      const result = await send('Hola', id);
      assert(!result.viaAi);
      assert.equal(await countIncoming(id), 1);
      assert.equal((await aiModelCallRepository.listForMessage(id)).length, 0);
    });

    gateState.phones = JSON.stringify([phone]);
    await check('flujo de cita activo: camino léxico aunque el teléfono esté permitido', async () => {
      const id = `wamid.sw-${suffix}-flow`;
      await userRepository.updateAppointmentFlowState(user.id, 'ask_date');
      try {
        const result = await send('mañana', id);
        assert(!result.viaAi);
        assert.equal((await aiModelCallRepository.listForMessage(id)).length, 0);
      } finally { await userRepository.clearAppointmentFlow(user.id); }
    });
    await check('encendido y teléfono permitido: responde la IA, una sola entrada, afterSend espera la clasificación', async () => {
      const id = `wamid.sw-${suffix}-ai1`;
      const result = await send('¿Cuánto cuesta un lote?', id);
      assert.equal(result.viaAi, true);
      assert(result.shouldSend && result.responses.length > 0, JSON.stringify(result));
      assert(result.afterSend, 'sin afterSend');
      await result.afterSend;
      assert.equal(await countIncoming(id), 1);
      const row = await aiTopicClassificationRepository.getForMessage(id);
      assert(row, 'la clasificación no quedó guardada tras afterSend');
      const calls = await aiModelCallRepository.listForMessage(id);
      assert(calls.some(call => call.call_type === 'responder' && !call.fallback_reason));
      console.log(`       respuesta: ${JSON.stringify(result.responses[0]).slice(0, 120)}`);
    });

    await check('9.3 el estado del bot léxico no se toca: foco, pregunta retenida y oferta pendiente', async () => {
      const scopes = await scopeRepository.getScopes();
      const development = scopes.find(scope => scope.parent_id === ROOT_SCOPE_ID);
      assert(development, 'sin desarrollo local');
      await userRepository.setScopeFocus(user.id, development.id, null);
      await userRepository.setPendingScopeQuestion(user.id, '¿cuánto cuesta?', 'precio');
      await userRepository.setPendingOffer(user.id, 'precio', null, [{ id: 'opt-1', scopeId: development.id, label: development.name }]);
      const before = await sessionRow(user.id);
      assert(before.current_scope_id && before.pending_scope_message && Array.isArray(before.pending_offer_options));
      // Preguntas de información: una tool de cita o asesor sí escribe en la sesión (awaiting_advisor_name) y no es lo que se mide aquí.
      const turns = ['¿y dónde está?', '¿tienen amenidades?', '¿y el precio de una casa?'];
      for (let index = 0; index < turns.length; index++) {
        const text = turns[index];
        const id = `wamid.sw-${suffix}-sess${index}`;
        const result = await send(text, id);
        assert.equal(result.viaAi, true, `el turno "${text}" no salió por la IA`);
        await result.afterSend;
      }
      assert.deepEqual(await sessionRow(user.id), before);
      assert.equal(await userRepository.getAppointmentFlowState(user.id), null, 'una pregunta de información no debe iniciar el flujo de cita');
    });

    await check('9.4 el brochure sale en una forma que el webhook ya sabe enviar', async () => {
      const id = `wamid.sw-${suffix}-brochure`;
      const result = await send('me mandas el brochure?', id);
      assert.equal(result.viaAi, true);
      await result.afterSend;
      assert(result.shouldSend && result.responses.length > 0);
      assert(result.responses.every(item => typeof item === 'string' || isFragmentedResponse(item) || isSimpleResponseWithMedia(item)));
      assert(!result.isFallback && result.flowHandled === true, 'flowHandled evita que el webhook emita el mensaje del flujo de cita');
      const documents = result.responses.flatMap(item => typeof item !== 'string' && isFragmentedResponse(item)
        ? item.fragments.filter(fragment => fragment.type === 'document') : []);
      const media = result.responses.filter(item => typeof item !== 'string' && isSimpleResponseWithMedia(item));
      console.log(`       documentos en fragmentos: ${documents.length}, con media: ${media.length}`);
      assert(documents.length + media.length > 0, 'la respuesta no trae el archivo del brochure');
    });

    await check('mensaje duplicado (reintento de Meta): no se responde ni se guarda de nuevo', async () => {
      const id = `wamid.sw-${suffix}-ai1`;
      const result = await send('¿Cuánto cuesta un lote?', id);
      assert.equal(result.shouldSend, false);
      assert.deepEqual(result.responses, []);
      assert.equal(await countIncoming(id), 1);
    });

    await check('respaldo (sin clave): responde el camino léxico, una sola entrada, y la clasificación se registra', async () => {
      const id = `wamid.sw-${suffix}-fallback`;
      const key = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      let result;
      try { result = await quietly(() => send('Hola', id)); }
      finally { process.env.ANTHROPIC_API_KEY = key; }
      assert(!result.viaAi, 'debía responder el camino léxico');
      assert(result.shouldSend && result.responses.length > 0);
      assert(result.afterSend, 'el respaldo conserva afterSend para registrar la fila');
      await result.afterSend;
      assert.equal(await countIncoming(id), 1);
      const calls = await aiModelCallRepository.listForMessage(id);
      assert(calls.some(call => call.call_type === 'responder' && call.fallback_reason), JSON.stringify(calls.map(c => [c.call_type, c.fallback_reason])));
      assert(await aiTopicClassificationRepository.getForMessage(id));
    });
  } finally {
    if (userId) {
      const { error } = await supabaseServer.from('users').delete().eq('id', userId);
      if (error) { failed++; console.error(`No se pudo borrar el usuario desechable: ${error.message}`); }
      else console.log('Usuario desechable borrado.');
    }
  }
}

async function main() {
  await pureChecks();
  await integrationChecks();
  if (failed) { console.error(`\n${failed} verificaciones fallaron.`); process.exitCode = 1; }
  else console.log('\nInterruptor, flujos, oferta, afterSend y camino con IA verificados.');
}

main().catch(error => { console.error(error); process.exit(1); });
