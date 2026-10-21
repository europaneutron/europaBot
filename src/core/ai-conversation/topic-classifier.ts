import type Anthropic from '@anthropic-ai/sdk';
import type { ClassifiedTopic, DiscardedTopic } from '@/data/models/ai-topic-classification.model';
import type { NewAiModelCall } from '@/data/repositories/ai-model-call.repository';
import { classifyAnthropicError, type ClassifierConfig, type ResponderClient } from '@/services/anthropic/client';
import { AFFIRMATIVE_PHRASES } from '@/core/conversation/affirmative-phrases';
import { normalizeVariableKey } from '@/lib/interpolate-message';

export interface TopicDefinition {
  name: string;
  description: string;
  examples: string[];
}
export interface ClassifierDevelopment {
  id: string;
  name: string;
}
export interface PriorTurn {
  role: 'persona' | 'asistente';
  text: string;
}
export interface ClassifierInput {
  userId: string;
  messageId: string;
  message: string;
  priorTurns: PriorTurn[];
  topics: TopicDefinition[];
  developments: ClassifierDevelopment[];
  config: ClassifierConfig;
}
export interface ClassifierDependencies {
  client: ResponderClient;
  log(call: NewAiModelCall): Promise<void>;
  now?: () => number;
}
export interface ClassificationOutput {
  topics: ClassifiedTopic[];
  otherTopic: string | null;
  discarded: DiscardedTopic[];
  failureReason: string | null;
}

export const GENERAL_DEVELOPMENT = 'general';
const MAX_OTHER_TOPIC_CHARS = 120;
const MAX_TURN_CHARS = 500;
const MAX_EXAMPLES_PER_TOPIC = 4;

// Comparar sin acentos, mayúsculas, puntuación ni espacios repetidos: el modelo
// copia la cita con su propia ortografía y eso no la vuelve una invención.
export function normalizeForQuote(text: string): string {
  return normalizeVariableKey(text).replace(/[^a-z0-9]+/g, ' ').trim();
}

const GREETING_PHRASES = [
  'hola', 'buenas', 'buenos', 'buen dia', 'buenos dias', 'buenas tardes', 'buenas noches', 'hey',
  'que tal', 'saludos', 'gracias', 'muchas gracias', 'listo', 'entendido', 'adios', 'hasta luego', 'bye',
];

/** Una cita hecha solo de saludos, agradecimientos y afirmativos no justifica un tema. */
export function isGreetingOrAffirmative(normalizedQuote: string): boolean {
  const phrases = Array.from(new Set([...GREETING_PHRASES, ...AFFIRMATIVE_PHRASES.map(normalizeForQuote)]))
    .filter(Boolean).sort((a, b) => b.length - a.length);
  let rest = ` ${normalizedQuote} `;
  for (const phrase of phrases) rest = rest.split(` ${phrase} `).join('  ');
  return rest.trim() === '';
}

const containsWords = (message: string, quote: string) => ` ${message} `.includes(` ${quote} `);

export interface ValidationContext {
  message: string;
  topicNames: ReadonlySet<string>;
  developments: readonly ClassifierDevelopment[];
}

/** Orden fijo: tema activo, cita presente, cita con contenido, desarrollo existente. */
export function validateClassification(rawTopics: unknown[], rawOtherTopic: unknown, context: ValidationContext):
  Pick<ClassificationOutput, 'topics' | 'otherTopic' | 'discarded'> {
  const topics: ClassifiedTopic[] = [];
  const discarded: DiscardedTopic[] = [];
  const message = normalizeForQuote(context.message);
  const developmentsByName = new Map(context.developments.map(item => [normalizeForQuote(item.name), item.id]));
  const seen = new Set<string>();
  for (const candidate of rawTopics) {
    const discard = (reason: string) => discarded.push({ candidate, reason });
    if (!candidate || typeof candidate !== 'object') { discard('invalid_shape'); continue; }
    const row = candidate as Record<string, unknown>;
    if (typeof row.tema !== 'string' || typeof row.cita !== 'string' || typeof row.desarrollo !== 'string'
      || (row.claridad !== 'clara' && row.claridad !== 'dudosa')) { discard('invalid_shape'); continue; }
    if (!context.topicNames.has(row.tema)) { discard('unknown_topic'); continue; }
    const quote = normalizeForQuote(row.cita);
    if (!quote || !containsWords(message, quote)) { discard('quote_not_in_message'); continue; }
    if (isGreetingOrAffirmative(quote)) { discard('quote_greeting_or_affirmative'); continue; }
    let mentionedScopeId: string | null = null;
    if (row.desarrollo !== GENERAL_DEVELOPMENT) {
      const id = developmentsByName.get(normalizeForQuote(row.desarrollo));
      if (!id) { discard('unknown_development'); continue; }
      mentionedScopeId = id;
    }
    if (seen.has(row.tema)) { discard('duplicate_topic'); continue; }
    seen.add(row.tema);
    topics.push({ intent_name: row.tema, quote: row.cita.trim(), clarity: row.claridad, mentioned_scope_id: mentionedScopeId });
  }
  const other = typeof rawOtherTopic === 'string' ? rawOtherTopic.trim().slice(0, MAX_OTHER_TOPIC_CHARS) : '';
  return { topics, otherTopic: other || null, discarded };
}

export function buildClassifierSchema(topics: TopicDefinition[], developments: ClassifierDevelopment[]) {
  return {
    type: 'object',
    properties: {
      temas: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            tema: { type: 'string', enum: topics.map(topic => topic.name) },
            cita: { type: 'string' },
            claridad: { type: 'string', enum: ['clara', 'dudosa'] },
            desarrollo: { type: 'string', enum: [...developments.map(item => item.name), GENERAL_DEVELOPMENT] },
          },
          required: ['tema', 'cita', 'claridad', 'desarrollo'],
          additionalProperties: false,
        },
      },
      otro_tema: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    },
    required: ['temas', 'otro_tema'],
    additionalProperties: false,
  };
}

/** Estable entre mensajes: solo cambia cuando cambian los temas o los desarrollos. */
export function buildClassifierSystemPrompt(topics: TopicDefinition[], developments: ClassifierDevelopment[]): string {
  const topicLines = [...topics].sort((a, b) => a.name < b.name ? -1 : 1).map(topic => {
    const examples = topic.examples.slice(0, MAX_EXAMPLES_PER_TOPIC).map(example => `"${example}"`).join(', ');
    return `- ${topic.name} (${topic.description})${examples ? `: se pregunta como ${examples}` : ''}`;
  });
  const developmentNames = developments.map(item => item.name).sort();
  return [
    'Eres el clasificador de temas de un chat de WhatsApp de venta de viviendas. Lees el último mensaje de la persona interesada y dices de qué temas de la lista habla.',
    '',
    '# Temas',
    ...topicLines,
    '',
    '# Desarrollos',
    developmentNames.length ? developmentNames.join(', ') : '(ninguno)',
    '',
    '# Cómo se clasifica',
    '- Cuenta únicamente lo que escribe la persona en su último mensaje. Los turnos anteriores sirven para entender a qué se refiere ("esa", "ahí", "ese"); lo que ofreció o dijo el asistente describe la conversación y no es un tema de la persona.',
    '- Un mensaje puede traer varios temas, uno o ninguno. Un saludo, un agradecimiento y un "sí" a lo que el asistente ofreció son mensajes sin tema: la lista queda vacía.',
    '- Cada tema lleva su cita: las palabras exactas del último mensaje que lo muestran, copiadas tal cual.',
    '- La claridad es "clara" cuando la persona pregunta por el tema o pide información de él, con o sin signos de pregunta: escribir el tema a secas o una lista de temas ("Precio, modelos y ubicación", "Financiamiento???") es pedir esa información. Es "dudosa" cuando lo menciona como contexto sin pedir nada ("ando viendo opciones", "mi esposa quiere jardín").',
    '- El desarrollo es el que la persona nombra o el que sale de los turnos anteriores; si no hay ninguno, es "general".',
    '- Un tema que no está en la lista queda fuera de "temas" y se resume en pocas palabras en "otro_tema"; sin tema ajeno, "otro_tema" es null.',
    '- Un mensaje se asigna al tema de la lista solo cuando la persona habla de él, aunque use otras palabras.',
  ].join('\n');
}

export function buildClassifierUserMessage(message: string, priorTurns: PriorTurn[]): string {
  const turns = priorTurns.map(turn => `${turn.role === 'persona' ? 'Persona' : 'Asistente'}: ${turn.text.slice(0, MAX_TURN_CHARS)}`);
  return [
    turns.length ? `Turnos anteriores:\n${turns.join('\n')}` : 'Turnos anteriores: ninguno.',
    '',
    'Último mensaje de la persona:',
    message,
  ].join('\n');
}

function textOf(content: Anthropic.ContentBlock[]): string {
  return content.filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text).join('').trim();
}

/** Nunca lanza: un fallo se devuelve como causa para que la respuesta al lead siga su curso. */
export async function classifyTopics(input: ClassifierInput, deps: ClassifierDependencies): Promise<ClassificationOutput> {
  const now = deps.now || Date.now;
  const started = now();
  const systemPrompt = buildClassifierSystemPrompt(input.topics, input.developments);
  const log: NewAiModelCall = {
    user_id: input.userId, conversation_id: null, message_id: input.messageId,
    call_type: 'classifier', model: input.config.model,
    input_tokens: null, cache_read_input_tokens: null, cache_creation_input_tokens: null,
    output_tokens: null, latency_ms: 0, tools_called: [], guards_applied: [],
    fallback_reason: null, error_type: null, context_size_chars: systemPrompt.length,
  };
  const failed = (reason: string, errorType?: string): ClassificationOutput => {
    log.fallback_reason = reason;
    log.error_type = errorType || null;
    return { topics: [], otherTopic: null, discarded: [], failureReason: reason };
  };
  try {
    // Sin temas activos el enum del esquema quedaría vacío; no hay nada que clasificar.
    if (!input.topics.length) return { topics: [], otherTopic: null, discarded: [], failureReason: null };
    const message = await deps.client.create({
      model: input.config.model, max_tokens: 800, stream: false,
      output_config: {
        effort: input.config.effort,
        format: { type: 'json_schema', schema: buildClassifierSchema(input.topics, input.developments) },
      },
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: buildClassifierUserMessage(input.message, input.priorTurns) }],
    }, input.config.timeoutMs);
    log.latency_ms = Math.max(0, now() - started);
    log.input_tokens = message.usage.input_tokens;
    log.output_tokens = message.usage.output_tokens;
    log.cache_read_input_tokens = message.usage.cache_read_input_tokens ?? 0;
    log.cache_creation_input_tokens = message.usage.cache_creation_input_tokens ?? 0;
    if (message.stop_reason === 'refusal') return failed('refusal');
    if (message.stop_reason === 'max_tokens') return failed('max_tokens');
    let parsed: unknown;
    try { parsed = JSON.parse(textOf(message.content)); }
    catch { return failed('invalid_json'); }
    const body = parsed as { temas?: unknown; otro_tema?: unknown } | null;
    if (!body || typeof body !== 'object' || !Array.isArray(body.temas)) return failed('invalid_output');
    const validated = validateClassification(body.temas, body.otro_tema, {
      message: input.message,
      topicNames: new Set(input.topics.map(topic => topic.name)),
      developments: input.developments,
    });
    if (validated.discarded.length) log.guards_applied.push({ guard: 'topic_validation', discarded: validated.discarded });
    return { ...validated, failureReason: null };
  } catch (error) {
    const failure = classifyAnthropicError(error);
    return failed(failure.reason, failure.errorType);
  } finally {
    if (!log.latency_ms) log.latency_ms = Math.max(0, now() - started);
    try { await deps.log(log); }
    catch (error) { console.error('No se pudo registrar la llamada del clasificador:', error); }
  }
}
