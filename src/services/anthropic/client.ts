import Anthropic from '@anthropic-ai/sdk';

export interface ResponderConfig {
  model: string;
  effort: NonNullable<Anthropic.OutputConfig['effort']>;
  timeoutMs: number;
  messagesPerHour: number;
}

export function parseResponderConfig(values: Record<string, string>): ResponderConfig {
  const effort = values.ai_responder_effort || 'low';
  if (!['low', 'medium', 'high', 'xhigh', 'max'].includes(effort)) {
    throw new Error('ai_responder_effort no es válido');
  }
  const positiveInteger = (key: string, fallback: number) => {
    const value = values[key] === undefined ? fallback : Number(values[key]);
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${key} debe ser un entero positivo`);
    return value;
  };
  return {
    model: values.ai_responder_model || 'claude-haiku-5-5',
    effort: effort as ResponderConfig['effort'],
    timeoutMs: positiveInteger('ai_responder_timeout_ms', 8000),
    messagesPerHour: positiveInteger('ai_messages_per_phone_per_hour', 30),
  };
}

export async function loadResponderConfig(): Promise<ResponderConfig> {
  const { configRepository } = await import('@/data/repositories/config.repository');
  const { ROOT_SCOPE_ID } = await import('@/data/repositories/scope.repository');
  return parseResponderConfig(await configRepository.getManyByScope([
    'ai_responder_model', 'ai_responder_effort', 'ai_responder_timeout_ms',
    'ai_messages_per_phone_per_hour',
  ], ROOT_SCOPE_ID));
}

export interface ResponderClient {
  create(params: Anthropic.MessageCreateParamsNonStreaming, timeoutMs: number): Promise<Anthropic.Message>;
}

export function createResponderClient(): ResponderClient {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
  // El presupuesto de tiempo lo controla el contestador, sin reintentos ocultos del SDK.
  return { create: (params, timeoutMs) => client.messages.create(params, { timeout: timeoutMs }) };
}

export function classifyAnthropicError(error: unknown) {
  if (error instanceof Anthropic.APIConnectionTimeoutError) return { reason: 'timeout', errorType: error.name };
  if (error instanceof Anthropic.APIError) {
    return { reason: 'api_error', errorType: `${error.name}${error.status ? `:${error.status}` : ''}` };
  }
  if (error instanceof Anthropic.APIConnectionError) return { reason: 'api_error', errorType: error.name };
  return { reason: 'internal_error', errorType: error instanceof Error ? error.name : 'UnknownError' };
}

export interface ClassifierConfig {
  model: string;
  effort: NonNullable<Anthropic.OutputConfig['effort']>;
  timeoutMs: number;
}
export type ScoreSource = 'matcher' | 'classifier';

export function parseClassifierConfig(values: Record<string, string>): ClassifierConfig {
  const effort = values.ai_classifier_effort || 'low';
  if (!['low', 'medium', 'high', 'xhigh', 'max'].includes(effort)) {
    throw new Error('ai_classifier_effort no es válido');
  }
  const timeoutMs = values.ai_classifier_timeout_ms === undefined ? 4000 : Number(values.ai_classifier_timeout_ms);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('ai_classifier_timeout_ms debe ser un entero positivo');
  }
  return {
    model: values.ai_classifier_model || 'claude-haiku-5-5',
    effort: effort as ClassifierConfig['effort'],
    timeoutMs,
  };
}

/** Un valor desconocido cae al matcher: el score nunca debe cambiar de fuente por un error de captura. */
export function parseScoreSource(value: string | undefined): ScoreSource {
  if (value === 'classifier') return 'classifier';
  if (value !== undefined && value !== 'matcher') console.error(`ai_score_source desconocido (${value}); se usa matcher`);
  return 'matcher';
}

export async function loadClassifierConfig(): Promise<ClassifierConfig> {
  const { configRepository } = await import('@/data/repositories/config.repository');
  const { ROOT_SCOPE_ID } = await import('@/data/repositories/scope.repository');
  return parseClassifierConfig(await configRepository.getManyByScope([
    'ai_classifier_model', 'ai_classifier_effort', 'ai_classifier_timeout_ms',
  ], ROOT_SCOPE_ID));
}

export async function loadScoreSource(): Promise<ScoreSource> {
  const { configRepository } = await import('@/data/repositories/config.repository');
  const { ROOT_SCOPE_ID } = await import('@/data/repositories/scope.repository');
  const values = await configRepository.getManyByScope(['ai_score_source'], ROOT_SCOPE_ID);
  return parseScoreSource(values.ai_score_source);
}
