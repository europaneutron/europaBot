import { config } from 'dotenv';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import { handleAiMessage, type AiHandlerDependencies, type AiMessageInput } from '../src/core/ai-conversation/ai-message-handler';
import { buildTools, executeAiTool, type AiDevelopment } from '../src/core/ai-conversation/tools';
import { buildHistory } from '../src/core/ai-conversation/history';
import { parseResponderConfig } from '../src/services/anthropic/client';
import type { NewAiModelCall } from '../src/data/repositories/ai-model-call.repository';
import type { AiContext } from '../src/core/ai-conversation/responder';

config({ quiet: true, path: resolve(process.cwd(), '.env.development.local') });
config({ quiet: true, path: resolve(process.cwd(), '.env.local') });

const developments: AiDevelopment[] = [
  { id: 'europa', name: 'Europa', hasResources: true, hasAppointments: true },
  { id: 'altabrisa', name: 'Altabrisa', hasResources: false, hasAppointments: false },
];
const context: AiContext = {
  systemPrompt: 'Persona y catálogo estable.', contextSizeChars: 27, developments,
  developmentNames: ['Altabrisa', 'Europa'], moneyValues: [2350000], faqMoneyValues: [], catalogBlocks: [], excluded: [],
};
const input: AiMessageInput = {
  userId: 'user', phoneNumber: '525500000000', messageId: 'msg', messageText: 'Hola',
  facts: { now: new Date('2026-10-20T12:00:00Z'), hasActiveAppointment: false, shouldOfferAppointment: false },
  suppressExternalMessages: true,
};
const flow = { responses: ['¿Qué día te gustaría visitarnos?'], shouldSend: true, wasDetected: true, isFallback: false, flowHandled: true };
function message(text = 'Hola', stop: Anthropic.Message['stop_reason'] = 'end_turn', content?: Anthropic.ContentBlock[]): Anthropic.Message {
  return {
    id: 'reply', type: 'message', role: 'assistant', model: 'claude-haiku-5-5',
    content: content || [{ type: 'text', text, citations: null }],
    stop_reason: stop, stop_sequence: null, stop_details: null, container: null, diagnostics: null,
    usage: {
      input_tokens: 15, output_tokens: 8, cache_read_input_tokens: 12, cache_creation_input_tokens: 5,
      cache_creation: null, inference_geo: null, server_tool_use: null, service_tier: 'standard', output_tokens_details: null, speed: null,
    },
  };
}
function tool(name: string, input: unknown = { desarrollo: 'Europa' }, stop: Anthropic.Message['stop_reason'] = 'tool_use') {
  return message('', stop, [{ type: 'tool_use', id: 'tool-1', name, input, caller: { type: 'direct' } }]);
}
function harness(sequence: Array<Anthropic.Message | Error>) {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const logs: NewAiModelCall[] = [];
  let saved = 0;
  let effects = 0;
  const deps: AiHandlerDependencies = {
    config: async () => parseResponderConfig({}), context: async () => context,
    hasIncoming: async () => saved > 0, countMessages: async () => 0, history: async () => [],
    saveIncoming: async () => { saved++; },
    client: { create: async params => {
      calls.push(structuredClone(params));
      const result = sequence.shift();
      assert(result, 'El loop excedió las llamadas esperadas');
      if (result instanceof Error) throw result;
      return result;
    } },
    log: async call => { logs.push(structuredClone(call)); },
    tools: {
      loadDevelopments: async () => developments,
      appointment: async () => { effects++; return flow; },
      advisor: async () => { effects++; return { ...flow, responses: ['¿Cuál es tu nombre?'] }; },
      brochure: async () => { effects++; return [{ text: 'Material', media_url: 'https://example.test/a.pdf', media_type: 'document' }]; },
    },
  };
  return { deps, calls, logs, saved: () => saved, effects: () => effects };
}

async function main() {
  const apiError = (status: number, message: string) => new Anthropic.APIError(status, { type: 'error', message }, message, new Headers());
  const failures: Array<[string, Array<Anthropic.Message | Error>]> = [
    ['timeout', [new Anthropic.APIConnectionTimeoutError()]],
    ['api_error', [apiError(402, 'insufficient credit / billing')]],
    ['api_error', [apiError(400, 'Your credit balance is too low')]],
    ['api_error', [apiError(401, 'invalid API key')]],
    ['api_error', [apiError(429, 'rate limit')]],
    ['api_error', [apiError(500, 'provider failure')]],
    ['api_error', [new Anthropic.APIConnectionError({ message: 'connection failed' })]],
    ['refusal', [tool('agendar_visita', { desarrollo: 'Europa' }, 'refusal')]],
    ['max_tokens', [tool('agendar_visita', { desarrollo: 'Europa' }, 'max_tokens')]],
    ['invalid_money', [message('$999'), message('$998')]],
    ['empty_response', [message('   ')]],
    ['bracketed_note', [message('[llamada a hablar_con_asesor]')]],
    ['unexpected_stop_reason', [message('incompleto', 'pause_turn')]],
    ['invalid_tool_response', [message('Sin tool', 'tool_use')]],
    ['internal_error', [new Error('unexpected client error')]],
  ];
  for (const [reason, sequence] of failures) {
    const expectedCalls = sequence.length;
    const h = harness(sequence);
    const result = await handleAiMessage(input, h.deps);
    assert.equal(result.kind, 'fallback', reason);
    if (result.kind === 'fallback') assert.equal(result.reason, reason);
    assert.equal(h.calls.length, expectedCalls);
    assert.equal(h.logs.length, expectedCalls);
    assert.equal(h.logs.at(-1)?.fallback_reason, reason);
    assert.equal(h.saved(), 0, 'El respaldo deja persistir la entrada al camino léxico');
    assert.equal(h.effects(), 0, 'Rechazos y truncamientos nunca ejecutan herramientas');
    if (reason === 'invalid_money') assert(h.logs.every(log => log.guards_applied.length > 0));
  }
  const success = harness([message('**Precio** $2.35 millones')]);
  const ok = await handleAiMessage(input, success.deps);
  assert.equal(ok.kind, 'response');
  if (ok.kind === 'response') assert.deepEqual(ok.response.responses, ['*Precio* $2.35 millones']);
  assert.deepEqual(await handleAiMessage(input, success.deps), { kind: 'duplicate' });
  assert.equal(success.calls.length, 1);
  assert.equal(success.saved(), 1);
  const request = success.calls[0];
  assert.equal(request.model, 'claude-haiku-5-5');
  assert.deepEqual(request.output_config, { effort: 'low' });
  assert.deepEqual(request.system, [{ type: 'text', text: context.systemPrompt, cache_control: { type: 'ephemeral' } }]);
  assert.equal(request.messages[0].role, 'user');
  assert.equal(request.messages.at(-1)?.role, 'system');
  assert.equal(request.messages.at(-2)?.content, input.messageText);
  assert.equal(success.logs[0].cache_read_input_tokens, 12);
  assert.equal(success.logs[0].cache_creation_input_tokens, 5);
  assert.equal(success.logs[0].input_tokens, 15);
  assert.equal(success.logs[0].output_tokens, 8);
  assert.equal(success.logs[0].context_size_chars, 27);
  assert(success.logs[0].guards_applied.length);

  const retry = harness([message('$999'), message('$2,350,000')]);
  assert.equal((await handleAiMessage(input, retry.deps)).kind, 'response');
  assert.deepEqual(retry.calls[1].tool_choice, { type: 'none' });
  assert.equal(retry.logs.length, 2);

  const quoted = harness([message('Con $20,000 apartas tu casa.')]);
  quoted.deps.history = async () => [{ direction: 'inbound', message_text: 'vi que con 20mil apartaba', message_id: 'old' }];
  assert.equal((await handleAiMessage({ ...input, messageText: 'cuanto es el apartado' }, quoted.deps)).kind, 'response');
  assert.equal(quoted.calls.length, 1, 'la cifra de la persona no dispara reintento');

  const nameFact = harness([message('$999'), message('$2,350,000')]);
  await handleAiMessage(input, nameFact.deps);
  const instruction = String(nameFact.calls[1].messages.at(-1)?.content);
  assert(instruction.includes('$999') && instruction.includes('$2,350,000'), instruction);
  assert(!/lo siento|perd[oó]n/i.test(instruction));

  const events: string[] = [];
  const pending = new Set<string>();
  const order: string[] = [];
  const queueFor = (): NonNullable<AiHandlerDependencies['turnQueue']> => ({
    enqueue: async (_user, id) => { order.push(id); pending.add(id); },
    isNext: async (_user, id) => order.filter(item => pending.has(item))[0] === id,
    release: async id => { events.push(`release ${id}`); pending.delete(id); },
    sleep: ms => new Promise(done => setTimeout(done, Math.min(ms, 5))),
    maxWaitMs: 2_000, pollMs: 5,
  });
  const burst = ['a', 'b', 'c'].map(id => {
    const h = harness([message(`Respuesta ${id}`)]);
    const histories: string[] = [];
    h.deps.turnQueue = queueFor();
    h.deps.history = async () => { histories.push(events.join(',')); return []; };
    h.deps.saveIncoming = async () => { events.push(`save ${id}`); };
    h.deps.hasIncoming = async () => false;
    return { id, h, histories };
  });
  const burstResults = await Promise.all(burst.map(async (item, index) => {
    await new Promise(done => setTimeout(done, index));
    return handleAiMessage({ ...input, messageId: item.id }, item.h.deps);
  }));
  assert(burstResults.every(result => result.kind === 'response'));
  assert.deepEqual(events, ['save a', 'release a', 'save b', 'release b', 'save c', 'release c']);
  assert.equal(burst[2].histories[0], 'save a,release a,save b,release b', 'el tercero ve a los dos anteriores guardados');

  const stuck = harness([message('Respuesta sin cola')]);
  stuck.deps.turnQueue = { ...queueFor(), isNext: async () => false, maxWaitMs: 30 };
  const stuckStart = Date.now();
  assert.equal((await handleAiMessage(input, stuck.deps)).kind, 'response');
  assert(Date.now() - stuckStart < 1_000, 'la espera tiene tope');
  const broken = harness([message('Respuesta con cola caída')]);
  broken.deps.turnQueue = { ...queueFor(), enqueue: async () => { throw new Error('base caída'); } };
  assert.equal((await handleAiMessage(input, broken.deps)).kind, 'response');

  const limited = harness([]);
  limited.deps.countMessages = async (phone, since) => {
    assert.equal(phone, input.phoneNumber);
    assert.equal(since.getTime(), 10_000_000 - 3_600_000);
    return 30;
  };
  limited.deps.now = () => 10_000_000;
  limited.deps.context = async () => { throw new Error('No debe cargar contexto'); };
  assert.deepEqual(await handleAiMessage(input, limited.deps), { kind: 'fallback', reason: 'rate_limit' });
  assert.equal(limited.calls.length, 0);
  assert.equal(limited.logs[0].fallback_reason, 'rate_limit');

  for (const name of ['agendar_visita', 'hablar_con_asesor']) {
    const h = harness([tool(name)]);
    const result = await handleAiMessage(input, h.deps);
    assert.equal(result.kind, 'response');
    if (result.kind === 'response') assert.equal(result.response.responses[0], name === 'agendar_visita' ? flow.responses[0] : '¿Cuál es tu nombre?');
    assert.equal(h.calls.length, 1);
    assert.equal(h.effects(), 1);
    assert.equal(h.logs[0].tools_called.length, 1);
  }
  const brochure = harness([tool('enviar_brochure'), message('Te adjunto el material.')]);
  const sent = await handleAiMessage(input, brochure.deps);
  assert.equal(sent.kind, 'response');
  if (sent.kind === 'response') {
    assert.equal(sent.response.responses.length, 2);
    assert.equal(sent.response.responses[0], 'Te adjunto el material.', 'El texto va antes del documento');
  }
  const resultMessage = brochure.calls[1].messages.at(-1)!;
  assert.equal(resultMessage.role, 'user');
  assert(Array.isArray(resultMessage.content));
  assert.equal(resultMessage.content[0].type, 'tool_result');
  assert(JSON.stringify(resultMessage).includes('se envía junto con tu mensaje'));

  const sameTurn = harness([message('', 'tool_use', [
    { type: 'text', text: 'Con gusto, aquí tienes el brochure.', citations: null },
    { type: 'tool_use', id: 'tool-1', name: 'enviar_brochure', input: { desarrollo: 'Europa' }, caller: { type: 'direct' } },
  ])]);
  const single = await handleAiMessage(input, sameTurn.deps);
  assert.equal(single.kind, 'response');
  assert.equal(sameTurn.calls.length, 1, 'El texto del mismo turno evita la segunda llamada');
  if (single.kind === 'response') {
    assert.equal(single.response.responses.length, 2);
    assert.equal(single.response.responses[0], 'Con gusto, aquí tienes el brochure.');
  }

  const rounds = harness([tool('enviar_brochure'), tool('enviar_brochure'), tool('agendar_visita')]);
  const capped = await handleAiMessage(input, rounds.deps);
  assert.equal(capped.kind, 'fallback');
  if (capped.kind === 'fallback') assert.equal(capped.reason, 'tool_round_limit');
  assert.equal(rounds.effects(), 1, 'Una tool repetida no duplica adjuntos');
  assert.deepEqual(rounds.calls[2].tool_choice, { type: 'none' });

  const invalid = harness([tool('agendar_visita', { desarrollo: 'Inventado' }), message('¿Qué desarrollo te interesa?')]);
  assert.equal((await handleAiMessage(input, invalid.deps)).kind, 'response');
  assert.equal(invalid.effects(), 0);
  assert(JSON.stringify(invalid.calls[1]).includes('"is_error":true'));
  const stale = harness([tool('agendar_visita'), message('Ya no hay horarios.')]);
  stale.deps.tools.loadDevelopments = async () => developments.map(item => ({ ...item, hasAppointments: false }));
  await handleAiMessage(input, stale.deps);
  assert.equal(stale.effects(), 0);

  const definitions = buildTools(developments);
  assert(definitions.every(item => item.strict));
  assert.deepEqual(definitions.find(item => item.name === 'agendar_visita')?.input_schema.properties,
    { desarrollo: { type: 'string', enum: ['Europa'] } });
  assert.deepEqual(buildTools(developments.map(item => ({ ...item, hasResources: false, hasAppointments: false }))).map(item => item.name), ['hablar_con_asesor']);
  assert.deepEqual(buildTools([developments[0]]).map(item => item.input_schema.properties), [{}, {}, {}]);
  const one = harness([]);
  one.deps.tools.loadDevelopments = async () => [developments[0]];
  assert((await executeAiTool({ name: 'agendar_visita', input: {} }, [developments[0]], one.deps.tools)).terminal);
  assert((await executeAiTool({ name: 'agendar_visita', input: { desarrollo: 'Europa' } }, [developments[0]], one.deps.tools)).isError);
  assert((await executeAiTool({ name: 'hablar_con_asesor', input: {} }, developments, one.deps.tools)).terminal);
  assert((await executeAiTool({ name: 'agendar_visita', input: {} }, developments, one.deps.tools)).isError);
  assert((await executeAiTool({ name: 'inventada', input: {} }, developments, one.deps.tools)).isError);

  assert.deepEqual(buildHistory([
    { direction: 'inbound', message_text: 'Ahora' },
    { direction: 'inbound', message_text: 'Otra' },
    { direction: 'outbound', message_text: 'B' },
    { direction: 'outbound', message_text: 'A' },
    { direction: 'inbound', message_text: 'Hola' },
    { direction: 'outbound', message_text: 'Huérfano' },
  ]), [{ role: 'user', content: 'Hola' }, { role: 'assistant', content: 'A\nB' }, { role: 'user', content: 'Otra\nAhora' }]);
  assert.equal(buildHistory(Array.from({ length: 12 }, (_, i) => ({ direction: 'inbound', message_text: String(i) })))[0].content,
    '9\n8\n7\n6\n5\n4\n3\n2\n1\n0');
  assert.deepEqual(buildHistory([{ direction: 'inbound', message_text: 'repetido', message_id: 'msg' }], 'msg'), []);
  assert.throws(() => parseResponderConfig({ ai_responder_timeout_ms: '0' }));
  assert.throws(() => parseResponderConfig({ ai_responder_effort: 'inventado' }));
  console.log('Contestador: respaldo, historial, tools, idempotencia, límite y auditoría verificados sin API ni DB.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
