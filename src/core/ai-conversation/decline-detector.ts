import type Anthropic from '@anthropic-ai/sdk';
import type { NewAiModelCall } from '@/data/repositories/ai-model-call.repository';
import { classifyAnthropicError, type ClassifierConfig, type ResponderClient } from '@/services/anthropic/client';
import { containsWords, normalizeForQuote } from './topic-classifier';

export interface DeclineDetectorDependencies {
  client: ResponderClient;
  config: ClassifierConfig;
  log(call: NewAiModelCall): Promise<void>;
}

const SYSTEM_PROMPT = [
  'Lees la respuesta de una persona en un chat de WhatsApp de venta de viviendas. El asistente le pidió su nombre para pasarla con un asesor.',
  'Tu única tarea es decir si el mensaje rechaza con claridad seguir con el asesor o con más ayuda ("no necesito más ayuda", "ya no quiero hablar con nadie", "déjalo así").',
  'Cualquier otro mensaje no es un rechazo: un nombre, un apodo, una pregunta, una queja o un texto que no se entiende. No decides si el mensaje es un nombre.',
  'Si es un rechazo, "cita" son las palabras exactas del mensaje que lo muestran, copiadas tal cual; si no, "cita" es una cadena vacía.',
].join('\n');

const SCHEMA = {
  type: 'object',
  properties: { rechaza: { type: 'boolean' }, cita: { type: 'string' } },
  required: ['rechaza', 'cita'],
  additionalProperties: false,
};

/** Un rechazo cuenta solo con una cita que aparece en el mensaje; el modelo no puede inventarlo. */
export function validateDecline(raw: unknown, text: string): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const body = raw as { rechaza?: unknown; cita?: unknown };
  if (body.rechaza !== true || typeof body.cita !== 'string') return false;
  const quote = normalizeForQuote(body.cita);
  return quote.length > 0 && containsWords(normalizeForQuote(text), quote);
}

/**
 * Detecta un rechazo claro durante la captura del nombre. Nunca lanza ni afirma
 * nada más: ante cualquier fallo devuelve false y el texto va a confirmación.
 */
export async function detectDecline(
  input: { userId: string; messageId: string; text: string }, deps: DeclineDetectorDependencies
): Promise<boolean> {
  const started = Date.now();
  const log: NewAiModelCall = {
    user_id: input.userId, conversation_id: null, message_id: input.messageId,
    call_type: 'classifier', model: deps.config.model,
    input_tokens: null, cache_read_input_tokens: null, cache_creation_input_tokens: null,
    output_tokens: null, latency_ms: 0, tools_called: [], guards_applied: [{ guard: 'decline_detector' }],
    fallback_reason: null, error_type: null, context_size_chars: SYSTEM_PROMPT.length,
  };
  try {
    const message = await deps.client.create({
      model: deps.config.model, max_tokens: 200, stream: false,
      output_config: { effort: deps.config.effort, format: { type: 'json_schema', schema: SCHEMA } },
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: input.text }],
    }, deps.config.timeoutMs);
    log.input_tokens = message.usage.input_tokens;
    log.output_tokens = message.usage.output_tokens;
    log.cache_read_input_tokens = message.usage.cache_read_input_tokens ?? 0;
    log.cache_creation_input_tokens = message.usage.cache_creation_input_tokens ?? 0;
    if (message.stop_reason === 'refusal' || message.stop_reason === 'max_tokens') {
      log.fallback_reason = message.stop_reason;
      return false;
    }
    const raw = JSON.parse(message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text').map(block => block.text).join('').trim());
    const declines = validateDecline(raw, input.text);
    if (!declines) log.guards_applied.push({ guard: 'decline_not_confirmed' });
    return declines;
  } catch (error) {
    const failure = classifyAnthropicError(error);
    log.fallback_reason = failure.reason;
    log.error_type = failure.errorType;
    return false;
  } finally {
    log.latency_ms = Math.max(0, Date.now() - started);
    try { await deps.log(log); }
    catch (error) { console.error('No se pudo registrar la llamada del detector de rechazo:', error); }
  }
}

/** Dependencias de producción: el mismo modelo, esfuerzo y tiempo límite del clasificador. */
export async function detectClearDecline(input: { userId: string; messageId: string; text: string }): Promise<boolean> {
  const [{ createResponderClient, loadClassifierConfig }, { aiModelCallRepository }] = await Promise.all([
    import('@/services/anthropic/client'), import('@/data/repositories/ai-model-call.repository'),
  ]);
  return detectDecline(input, {
    client: { create: (params, timeout) => createResponderClient().create(params, timeout) },
    config: await loadClassifierConfig(),
    log: call => aiModelCallRepository.save(call),
  });
}
