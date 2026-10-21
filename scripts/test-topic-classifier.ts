/**
 * Prueba del clasificador de temas. Tres partes:
 *   1. Validación y persistencia con un cliente falso (sin red ni base de datos).
 *   2. Casos de la spec contra la API real y el contenido de la base local (solo lectura),
 *      cada uno dos veces, con tabla de esperado contra obtenido.
 *   3. El handler completo con un usuario desechable (borrado al terminar).
 *
 *   npx tsx scripts/test-topic-classifier.ts
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import { assertLocalSupabase } from './helpers/fymsa-fixture';

config({ quiet: true, path: resolve(process.cwd(), '.env.development.local') });
config({ quiet: true, path: resolve(process.cwd(), '.env.local') });

import {
  classifyTopics, normalizeForQuote, validateClassification, buildClassifierSchema, buildClassifierSystemPrompt,
  type ClassifierInput, type TopicDefinition,
} from '../src/core/ai-conversation/topic-classifier';
import { recordTopicOutcome, type TopicScoringDependencies } from '../src/core/ai-conversation/topic-scoring';
import { waitBriefly } from '../src/core/ai-conversation/classification-pipeline';
import type { NewAiModelCall } from '../src/data/repositories/ai-model-call.repository';

const failures: string[] = [];
function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve().then(fn).then(
    () => console.log(`  ok   ${name}`),
    error => { failures.push(name); console.log(`  FALLA ${name}: ${error instanceof Error ? error.message : error}`); },
  );
}

const TOPICS: TopicDefinition[] = [
  { name: 'precio', description: 'Precio y Costos', examples: ['cuánto cuesta'] },
  { name: 'ubicacion', description: 'Ubicación', examples: ['dónde queda'] },
  { name: 'creditos', description: 'Créditos', examples: ['aceptan infonavit'] },
];
const DEVELOPMENTS = [{ id: 'dev-a', name: 'Altabrisa' }, { id: 'dev-e', name: 'Europa' }];
const CONFIG = { model: 'claude-haiku-5-5', effort: 'low' as const, timeoutMs: 4000 };

function fakeMessage(payload: unknown, extra: Partial<Anthropic.Message> = {}) {
  return {
    content: [{ type: 'text', text: typeof payload === 'string' ? payload : JSON.stringify(payload) }],
    stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 }, ...extra,
  } as unknown as Anthropic.Message;
}

async function runFake(message: string, response: () => Promise<Anthropic.Message>, calls: NewAiModelCall[] = []) {
  const requests: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const input: ClassifierInput = {
    userId: 'u', messageId: 'm', message, priorTurns: [], topics: TOPICS, developments: DEVELOPMENTS, config: CONFIG,
  };
  const output = await classifyTopics(input, {
    client: { create: async params => { requests.push(params); return response(); } },
    log: async call => { calls.push(call); },
  });
  return { output, requests, calls };
}

async function pureChecks() {
  console.log('Validación y persistencia con cliente falso');
  const topic = (tema: string, cita: string, desarrollo = 'general', claridad = 'clara') => ({ tema, cita, claridad, desarrollo });

  await check('normalizeForQuote quita acentos, mayúsculas, puntuación y espacios repetidos', () => {
    assert.equal(normalizeForQuote('  ¿Cuánto   CUESTA?! '), 'cuanto cuesta');
  });
  await check('lista vacía permitida: "Hola" sin temas', async () => {
    const { output } = await runFake('Hola', async () => fakeMessage({ temas: [], otro_tema: null }));
    assert.deepEqual(output.topics, []);
    assert.equal(output.failureReason, null);
  });
  await check('cita inventada se descarta con su causa', async () => {
    const { output } = await runFake('¿Dónde queda?', async () => fakeMessage({ temas: [topic('precio', 'cuánto cuesta')], otro_tema: null }));
    assert.equal(output.topics.length, 0);
    assert.equal(output.discarded[0].reason, 'quote_not_in_message');
  });
  await check('cita "Hola" se descarta aunque aparezca en el mensaje', async () => {
    const { output } = await runFake('Hola, buen día', async () => fakeMessage({ temas: [topic('precio', 'Hola')], otro_tema: null }));
    assert.equal(output.topics.length, 0);
    assert.equal(output.discarded[0].reason, 'quote_greeting_or_affirmative');
  });
  await check('cita "sí" y "claro, gracias" se descartan', async () => {
    for (const quote of ['sí', 'Claro, gracias']) {
      const { output } = await runFake(`${quote}`, async () => fakeMessage({ temas: [topic('ubicacion', quote)], otro_tema: null }));
      assert.equal(output.topics.length, 0, quote);
      assert.equal(output.discarded[0].reason, 'quote_greeting_or_affirmative');
    }
  });
  await check('cita con otra ortografía se acepta', async () => {
    const { output } = await runFake('Aceptan INFONAVIT?', async () => fakeMessage({ temas: [topic('creditos', 'aceptan infonavit')], otro_tema: null }));
    assert.equal(output.topics.length, 1);
    assert.equal(output.topics[0].intent_name, 'creditos');
  });
  await check('una cita con contenido que incluye un saludo se acepta', async () => {
    const { output } = await runFake('Hola, ¿cuánto cuesta?', async () => fakeMessage({ temas: [topic('precio', 'Hola, ¿cuánto cuesta?')], otro_tema: null }));
    assert.equal(output.topics.length, 1);
  });
  await check('tema inexistente, desarrollo inexistente, forma inválida y duplicado se descartan', async () => {
    const { output } = await runFake('¿Cuánto cuesta en Altabrisa y dónde queda?', async () => fakeMessage({
      temas: [
        topic('mascotas', 'cuánto cuesta'), topic('precio', 'cuánto cuesta', 'Narnia'),
        { tema: 'precio' }, topic('precio', 'cuánto cuesta', 'Altabrisa'), topic('precio', 'cuánto cuesta', 'Altabrisa'),
      ],
      otro_tema: null,
    }));
    assert.deepEqual(output.discarded.map(item => item.reason),
      ['unknown_topic', 'unknown_development', 'invalid_shape', 'duplicate_topic']);
    assert.deepEqual(output.topics.map(item => [item.intent_name, item.mentioned_scope_id]), [['precio', 'dev-a']]);
  });
  await check('desarrollo "general" queda como null y otro_tema se conserva', () => {
    const result = validateClassification([topic('precio', 'cuánto cuesta')], '  mascotas ', {
      message: '¿Cuánto cuesta?', topicNames: new Set(['precio']), developments: DEVELOPMENTS,
    });
    assert.equal(result.topics[0].mentioned_scope_id, null);
    assert.equal(result.otherTopic, 'mascotas');
  });
  await check('la petición lleva effort, esquema estructurado con enums y registro tipo classifier', async () => {
    const { requests, calls } = await runFake('Hola', async () => fakeMessage({ temas: [], otro_tema: null }));
    const params = requests[0];
    assert.equal(params.output_config?.effort, 'low');
    const schema = params.output_config?.format?.schema as ReturnType<typeof buildClassifierSchema>;
    assert.deepEqual(schema.properties.temas.items.properties.tema.enum, ['precio', 'ubicacion', 'creditos']);
    assert.deepEqual(schema.properties.temas.items.properties.desarrollo.enum, ['Altabrisa', 'Europa', 'general']);
    assert.equal(calls[0].call_type, 'classifier');
    assert.equal(calls[0].input_tokens, 10);
    assert.equal(calls[0].fallback_reason, null);
  });
  await check('el prompt de sistema es idéntico entre llamadas y no lleva el mensaje', () => {
    const a = buildClassifierSystemPrompt(TOPICS, DEVELOPMENTS);
    assert.equal(a, buildClassifierSystemPrompt([...TOPICS].reverse(), [...DEVELOPMENTS].reverse()));
  });
  await check('timeout del proveedor: sin lanzar, con causa y registro', async () => {
    const calls: NewAiModelCall[] = [];
    const { output } = await runFake('hola', async () => { throw new Anthropic.APIConnectionTimeoutError(); }, calls);
    assert.equal(output.failureReason, 'timeout');
    assert.deepEqual(output.topics, []);
    assert.equal(calls[0].fallback_reason, 'timeout');
  });
  await check('error de API, rechazo, corte, JSON roto y forma inválida son fallos con causa', async () => {
    const cases: Array<[string, () => Promise<Anthropic.Message>]> = [
      ['api_error', async () => { throw new Anthropic.APIError(402, {}, 'sin crédito', new Headers()); }],
      ['refusal', async () => fakeMessage('', { stop_reason: 'refusal' })],
      ['max_tokens', async () => fakeMessage('{"temas":[', { stop_reason: 'max_tokens' })],
      ['invalid_json', async () => fakeMessage('no es json')],
      ['invalid_output', async () => fakeMessage({ otro_tema: null })],
    ];
    for (const [reason, response] of cases) {
      const { output } = await runFake('hola', response);
      assert.equal(output.failureReason, reason);
    }
  });
  await check('falla del registro de la llamada no rompe la clasificación', async () => {
    const input: ClassifierInput = { userId: 'u', messageId: 'm', message: 'Hola', priorTurns: [], topics: TOPICS, developments: DEVELOPMENTS, config: CONFIG };
    const quiet = console.error; console.error = () => {};
    try {
      const output = await classifyTopics(input, {
        client: { create: async () => fakeMessage({ temas: [], otro_tema: null }) },
        log: async () => { throw new Error('base caída'); },
      });
      assert.equal(output.failureReason, null);
    } finally { console.error = quiet; }
  });
  await check('un clasificador lento no retrasa: waitBriefly vuelve en el plazo y el resto sigue', async () => {
    let finished = false;
    const slow = new Promise<void>(resolve => setTimeout(() => { finished = true; resolve(); }, 300));
    const started = Date.now();
    await waitBriefly(slow, 50);
    assert(Date.now() - started < 200, 'esperó más de la cuenta');
    assert.equal(finished, false);
    await slow;
  });

  const scoring = (initial: string[] = []) => {
    const state = { rows: [] as unknown[], marks: [] as Array<[string, string, string, string | null | undefined]>, recalcs: 0, done: new Set(initial) };
    const deps: TopicScoringDependencies = {
      saveClassification: async row => { state.rows.push(row); },
      isCheckpointCompleted: async (_u, _s, intent) => state.done.has(intent),
      markCheckpoint: async (u, s, intent, mentioned) => { state.marks.push([u, s, intent, mentioned]); state.done.add(intent); },
      recalculate: async () => { state.recalcs++; },
    };
    return { state, deps };
  };
  const classification = {
    topics: [
      { intent_name: 'precio', quote: 'cuánto cuesta', clarity: 'clara' as const, mentioned_scope_id: 'dev-a' },
      { intent_name: 'ubicacion', quote: 'donde', clarity: 'dudosa' as const, mentioned_scope_id: null },
    ],
    otherTopic: null, discarded: [], failureReason: null,
  };
  const matcher = { topics: ['ubicacion', 'precio'], top: { intentName: 'ubicacion', isCheckpoint: true } };
  const base = { userId: 'u', messageId: 'm', classification, matcher, replied: true, rootScopeId: 'root' };

  await check('fuente classifier: solo temas claros, en la raíz y con el desarrollo mencionado', async () => {
    const { state, deps } = scoring();
    const written = await recordTopicOutcome({ ...base, scoreSource: 'classifier' }, deps);
    assert.deepEqual(written, ['precio']);
    assert.deepEqual(state.marks, [['u', 'root', 'precio', 'dev-a']]);
    assert.equal(state.recalcs, 1);
    assert.deepEqual((state.rows[0] as { matcher_topics: string[] }).matcher_topics, ['ubicacion', 'precio']);
  });
  await check('fuente matcher: puntúa su coincidencia principal y el clasificador solo se registra', async () => {
    const { state, deps } = scoring();
    const written = await recordTopicOutcome({ ...base, scoreSource: 'matcher' }, deps);
    assert.deepEqual(written, ['ubicacion']);
    assert.deepEqual(state.marks, [['u', 'root', 'ubicacion', undefined]]);
    assert.equal((state.rows[0] as { topics: unknown[] }).topics.length, 2);
  });
  await check('un tema ya contado no se repite ni recalcula', async () => {
    const { state, deps } = scoring(['precio']);
    const written = await recordTopicOutcome({ ...base, scoreSource: 'classifier' }, deps);
    assert.deepEqual(written, []);
    assert.equal(state.recalcs, 0);
  });
  await check('con respaldo (sin respuesta de IA) se registra la fila y no se puntúa', async () => {
    const { state, deps } = scoring();
    const written = await recordTopicOutcome({ ...base, replied: false, scoreSource: 'classifier' }, deps);
    assert.deepEqual(written, []);
    assert.equal(state.rows.length, 1);
    assert.equal(state.marks.length, 0);
  });
  await check('clasificador fallido: fila sin temas con la causa y score sin cambios', async () => {
    const { state, deps } = scoring();
    const failed = { topics: [], otherTopic: null, discarded: [], failureReason: 'timeout' };
    await recordTopicOutcome({ ...base, classification: failed, scoreSource: 'classifier' }, deps);
    assert.equal((state.rows[0] as { failure_reason: string }).failure_reason, 'timeout');
    assert.equal(state.marks.length, 0);
  });
  await check('si guardar la fila falla, el score igual se escribe', async () => {
    const { state, deps } = scoring();
    deps.saveClassification = async () => { throw new Error('base caída'); };
    const quiet = console.error; console.error = () => {};
    try {
      const written = await recordTopicOutcome({ ...base, scoreSource: 'classifier' }, deps);
      assert.deepEqual(written, ['precio']);
      assert.equal(state.recalcs, 1);
    } finally { console.error = quiet; }
  });
}

interface ApiCase {
  id: string;
  message: string;
  prior?: Array<{ role: 'persona' | 'asistente'; text: string }>;
  expected: string;
  pass(output: Awaited<ReturnType<typeof classifyTopics>>): boolean;
}

const names = (output: { topics: Array<{ intent_name: string }> }) => output.topics.map(topic => topic.intent_name);
const hasClear = (output: { topics: Array<{ intent_name: string; clarity: string }> }, ...wanted: string[]) =>
  wanted.every(name => output.topics.some(topic => topic.intent_name === name && topic.clarity === 'clara'));

function buildCases(dev: string): ApiCase[] {
  return [
    { id: 'saludo', message: 'Hola', expected: '[]', pass: o => o.topics.length === 0 },
    { id: 'gracias', message: 'gracias', expected: '[]', pass: o => o.topics.length === 0 },
    { id: 'ok', message: 'ok', expected: '[]', pass: o => o.topics.length === 0 },
    { id: 'enganche', message: '¿con cuánto de enganche me la llevo?', expected: 'creditos o precio, clara',
      pass: o => hasClear(o, 'creditos') || hasClear(o, 'precio') },
    { id: 'varios', message: '¿cuánto cuesta y dónde queda?', expected: 'precio + ubicacion, claras',
      pass: o => hasClear(o, 'precio', 'ubicacion') },
    { id: 'mascotas', message: '¿aceptan mascotas?', expected: '[] + otro_tema "mascotas"',
      pass: o => o.topics.length === 0 && /mascota/i.test(o.otherTopic ?? '') },
    { id: 'infonavit', message: '¿tienen crédito Infonavit?', expected: 'creditos clara', pass: o => hasClear(o, 'creditos') },
    { id: 'jardin', message: 'ando viendo opciones, mi esposa quiere jardín', expected: '[] o dudosa (nada clara)',
      pass: o => o.topics.every(topic => topic.clarity === 'dudosa') },
    { id: 'oferta-si', message: 'sí',
      prior: [
        { role: 'persona', text: 'me interesa Europa Residencial' },
        { role: 'asistente', text: 'Es un gran fraccionamiento con casas y lotes. ¿Te comparto el brochure?' },
      ],
      expected: '[] (el bot ofreció el brochure)', pass: o => o.topics.length === 0 },
    { id: 'referencia', message: '¿y cuánto cuesta esa?',
      prior: [
        { role: 'persona', text: `cuéntame de ${dev}` },
        { role: 'asistente', text: `${dev} tiene casas en una zona tranquila de la ciudad.` },
      ],
      expected: `precio clara, cita "cuánto cuesta", dev ${dev}`,
      pass: o => hasClear(o, 'precio') && o.topics.find(t => t.intent_name === 'precio')!.mentioned_scope_id !== null
        && normalizeForQuote(o.topics.find(t => t.intent_name === 'precio')!.quote).includes('cuanto cuesta') },
    { id: 'dev-nombrado', message: `¿cuánto cuesta en ${dev}?`, expected: `precio, dev ${dev}`,
      pass: o => names(o).includes('precio') && o.topics.find(t => t.intent_name === 'precio')!.mentioned_scope_id !== null },
    { id: 'sin-dev', message: '¿manejan crédito?', expected: 'creditos general (dev null)',
      pass: o => hasClear(o, 'creditos') && o.topics.find(t => t.intent_name === 'creditos')!.mentioned_scope_id === null },
    { id: 'cita', message: 'quiero agendar una visita', expected: '[] (cita no es tema de la lista)', pass: o => o.topics.length === 0 },
  ];
}

const pad = (text: string, width: number) => text.length >= width ? text.slice(0, width - 1) + '…' : text.padEnd(width);

async function apiChecks() {
  console.log('\nCasos contra la API real y el contenido local');
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Falta ANTHROPIC_API_KEY en .env.development.local');
  assertLocalSupabase();
  const { intentConfigRepository } = await import('../src/data/repositories/intent-config.repository');
  const { buildAiContext } = await import('../src/core/ai-conversation/context-builder');
  const { createResponderClient, parseClassifierConfig } = await import('../src/services/anthropic/client');
  const { configRepository } = await import('../src/data/repositories/config.repository');
  const { ROOT_SCOPE_ID } = await import('../src/data/repositories/scope.repository');

  const topics = (await intentConfigRepository.listActiveCheckpointTopics()).map(row => ({
    name: row.intent_name, description: row.display_name,
    examples: (row.phrases.length ? row.phrases : row.keywords).map(text => text.replace(/^[¿]+|[?]+$/g, '').trim()).filter(Boolean),
  }));
  const context = await buildAiContext();
  const developments = context.developments.map(item => ({ id: item.id, name: item.name }));
  const config = parseClassifierConfig(await configRepository.getManyByScope([
    'ai_classifier_model', 'ai_classifier_effort', 'ai_classifier_timeout_ms'], ROOT_SCOPE_ID));
  console.log(`Temas: ${topics.map(topic => topic.name).join(', ')}`);
  console.log(`Desarrollos: ${developments.map(item => item.name).join(', ')}`);
  console.log(`Modelo: ${config.model}, effort ${config.effort}, timeout ${config.timeoutMs} ms`);
  console.log('Prompt de sistema:\n' + buildClassifierSystemPrompt(topics, developments).split('\n').map(line => '  | ' + line).join('\n'));
  console.log('Esquema: ' + JSON.stringify(buildClassifierSchema(topics, developments)));

  const client = createResponderClient();
  const calls: NewAiModelCall[] = [];
  const rows: string[] = [];
  let passed = 0, total = 0;
  const cases = buildCases(developments[0].name);
  for (const apiCase of cases) {
    for (let run = 1; run <= 2; run++) {
      const before = calls.length;
      const output = await classifyTopics({
        userId: 'script', messageId: `${apiCase.id}-${run}`, message: apiCase.message, priorTurns: apiCase.prior ?? [],
        topics, developments, config,
      }, { client, log: async call => { calls.push(call); } });
      const call = calls[before];
      const got = output.failureReason ? `FALLO ${output.failureReason}`
        : (output.topics.map(t => `${t.intent_name}(${t.clarity},${developments.find(d => d.id === t.mentioned_scope_id)?.name ?? 'general'},"${t.quote}")`).join(' + ') || '[]')
          + (output.otherTopic ? ` otro="${output.otherTopic}"` : '')
          + (output.discarded.length ? ` descartes=${output.discarded.map(d => d.reason).join('|')}` : '');
      const ok = !output.failureReason && apiCase.pass(output);
      total++; if (ok) passed++; else failures.push(`${apiCase.id} corrida ${run}: ${got}`);
      rows.push(`${ok ? 'OK   ' : 'FALLA'} | ${pad(apiCase.id, 13)} | ${run} | ${pad(apiCase.expected, 40)} | ${got} | ${call.latency_ms} ms in=${call.input_tokens} cache_r=${call.cache_read_input_tokens} cache_w=${call.cache_creation_input_tokens} out=${call.output_tokens}`);
    }
  }
  console.log('\nRESULTADO | caso          | n | esperado                                 | obtenido | latencia y tokens');
  rows.forEach(row => console.log(row));
  const latencies = calls.map(call => call.latency_ms).sort((a, b) => a - b);
  const sum = (key: 'input_tokens' | 'output_tokens' | 'cache_read_input_tokens') => calls.reduce((acc, call) => acc + (call[key] ?? 0), 0);
  console.log(`\nAciertos: ${passed}/${total}`);
  console.log(`Latencia ms: mediana=${latencies[Math.floor(latencies.length / 2)]} min=${latencies[0]} max=${latencies[latencies.length - 1]}`);
  console.log(`Tokens por llamada (promedio): entrada=${(sum('input_tokens') / calls.length).toFixed(0)} salida=${(sum('output_tokens') / calls.length).toFixed(0)} cache_read=${(sum('cache_read_input_tokens') / calls.length).toFixed(0)}`);
  return { developments };
}

async function handlerChecks(developments: Array<{ id: string; name: string }>) {
  console.log('\nHandler completo con usuario desechable');
  const { handleAiMessage } = await import('../src/core/ai-conversation/ai-message-handler');
  const { userRepository } = await import('../src/data/repositories/user.repository');
  const { aiModelCallRepository } = await import('../src/data/repositories/ai-model-call.repository');
  const { aiTopicClassificationRepository } = await import('../src/data/repositories/ai-topic-classification.repository');
  const { ROOT_SCOPE_ID } = await import('../src/data/repositories/scope.repository');
  const { leadScorer } = await import('../src/core/scoring');
  const { supabaseServer } = await import('../src/services/supabase/server-client');
  const { evaluateAppointmentOffer, createOfferEvaluationDependencies } = await import('../src/core/ai-conversation/appointment-offer-evaluation');

  const phone = `52999${Date.now().toString().slice(-7)}`;
  const suffix = randomUUID().slice(0, 6);
  let userId: string | null = null;
  try {
    const user = await userRepository.findOrCreateByPhone(phone, 'Prueba clasificador');
    userId = user.id;
    const facts = { now: new Date(), hasActiveAppointment: false, shouldOfferAppointment: false };

    const messageId = `wamid.cls-${suffix}-1`;
    const result = await handleAiMessage({
      userId: user.id, phoneNumber: phone, messageId, messageText: '¿cuánto cuesta y dónde queda?', facts, suppressExternalMessages: true,
    });
    await check('el contestador responde y la clasificación queda guardada (fuente matcher)', async () => {
      assert.equal(result.kind, 'response');
      const row = await aiTopicClassificationRepository.getForMessage(messageId);
      assert(row, 'sin fila en ai_topic_classifications');
      assert.equal(row.failure_reason, null);
      assert(row.topics.some(topic => topic.intent_name === 'precio'), JSON.stringify(row.topics));
      assert(row.matcher_topics.length > 0, 'matcher_topics vacío');
      console.log(`       clasificador: ${JSON.stringify(row.topics.map(t => [t.intent_name, t.clarity]))} matcher: ${JSON.stringify(row.matcher_topics)}`);
      const calls = await aiModelCallRepository.listForMessage(messageId);
      assert(calls.some(call => call.call_type === 'classifier'), 'sin llamada classifier');
      assert(calls.some(call => call.call_type === 'responder'), 'sin llamada responder');
    });
    await check('fuente matcher: checkpoint en la raíz sin desarrollo mencionado', async () => {
      const { data } = await supabaseServer.from('user_checkpoints').select('scope_id, intent_name, mentioned_scope_id').eq('user_id', user.id);
      assert(data && data.length >= 1, 'sin checkpoints');
      assert(data.every(row => row.scope_id === ROOT_SCOPE_ID && row.mentioned_scope_id === null), JSON.stringify(data));
      console.log(`       checkpoints: ${JSON.stringify(data.map(row => row.intent_name))}`);
    });

    const dev = developments[0];
    await check('fuente classifier (inyectada): checkpoint raíz con desarrollo, recalcula y alimenta la oferta', async () => {
      const deps: TopicScoringDependencies = {
        saveClassification: row => aiTopicClassificationRepository.save(row),
        isCheckpointCompleted: (u, s, i) => userRepository.isCheckpointCompleted(u, s, i),
        markCheckpoint: (u, s, i, m) => userRepository.markCheckpointCompleted(u, s, i, m),
        recalculate: (u, s) => leadScorer.afterCheckpointCompleted(u, s),
      };
      const before = await userRepository.countCompletedCheckpoints(user.id, ROOT_SCOPE_ID);
      const written = await recordTopicOutcome({
        userId: user.id, messageId: `wamid.cls-${suffix}-2`, scoreSource: 'classifier', replied: true, rootScopeId: ROOT_SCOPE_ID,
        matcher: { topics: [], top: null },
        classification: {
          topics: [
            { intent_name: 'creditos', quote: 'infonavit', clarity: 'clara', mentioned_scope_id: dev.id },
            { intent_name: 'amenidades', quote: 'jardin', clarity: 'dudosa', mentioned_scope_id: null },
          ],
          otherTopic: null, discarded: [], failureReason: null,
        },
      }, deps);
      assert.deepEqual(written, ['creditos']);
      const { data } = await supabaseServer.from('user_checkpoints').select('scope_id, mentioned_scope_id').eq('user_id', user.id).eq('intent_name', 'creditos');
      assert.equal(data?.length, 1);
      assert.equal(data![0].scope_id, ROOT_SCOPE_ID);
      assert.equal(data![0].mentioned_scope_id, dev.id);
      const after = await userRepository.countCompletedCheckpoints(user.id, ROOT_SCOPE_ID);
      assert.equal(after, before + 1);
      const breakdown = await leadScorer.getScoreBreakdown(user.id, ROOT_SCOPE_ID);
      assert.equal(breakdown.checkpointsCompleted, after);
      const offerDeps = await createOfferEvaluationDependencies();
      assert.equal(await offerDeps.countCompletedTopics(user.id), after, 'la oferta no usa el mismo conteo');
      // Con un umbral igual al conteo actual, la oferta se enciende con lo guardado.
      const offer = await evaluateAppointmentOffer(user.id, { ...offerDeps, settings: async () => ({ requiredCheckpoints: after, autoOfferEnabled: true }) });
      assert.equal(offer, true);
      const notYet = await evaluateAppointmentOffer(user.id, { ...offerDeps, settings: async () => ({ requiredCheckpoints: after + 1, autoOfferEnabled: true }) });
      assert.equal(notYet, false);
      console.log(`       score raíz: ${breakdown.totalScore} (${breakdown.status}), temas contados: ${after}`);
    });
    await check('un mensaje sin respuesta de IA registra la fila sin tocar checkpoints', async () => {
      const count = await userRepository.countCompletedCheckpoints(user.id, ROOT_SCOPE_ID);
      const deps: TopicScoringDependencies = {
        saveClassification: row => aiTopicClassificationRepository.save(row),
        isCheckpointCompleted: (u, s, i) => userRepository.isCheckpointCompleted(u, s, i),
        markCheckpoint: (u, s, i, m) => userRepository.markCheckpointCompleted(u, s, i, m),
        recalculate: (u, s) => leadScorer.afterCheckpointCompleted(u, s),
      };
      await recordTopicOutcome({
        userId: user.id, messageId: `wamid.cls-${suffix}-3`, scoreSource: 'classifier', replied: false, rootScopeId: ROOT_SCOPE_ID,
        matcher: null, classification: { topics: [{ intent_name: 'precio', quote: 'x', clarity: 'clara', mentioned_scope_id: null }], otherTopic: null, discarded: [], failureReason: null },
      }, deps);
      assert.equal(await userRepository.countCompletedCheckpoints(user.id, ROOT_SCOPE_ID), count);
      assert(await aiTopicClassificationRepository.getForMessage(`wamid.cls-${suffix}-3`));
    });
  } finally {
    if (userId) {
      const { supabaseServer } = await import('../src/services/supabase/server-client');
      const { error } = await supabaseServer.from('users').delete().eq('id', userId);
      if (error) failures.push(`No se pudo borrar el usuario desechable: ${error.message}`);
      else console.log('Usuario desechable borrado.');
    }
  }
}

async function main() {
  await pureChecks();
  const { developments } = await apiChecks();
  await handlerChecks(developments);
  if (failures.length) {
    console.error('\nFallas:\n- ' + failures.join('\n- '));
    process.exitCode = 1;
  } else {
    console.log('\nClasificador de temas: todo verificado.');
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
