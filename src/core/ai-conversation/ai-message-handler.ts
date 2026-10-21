import { createResponderClient, loadResponderConfig, type ResponderConfig } from '@/services/anthropic/client';
import { appendUserMessage, buildHistory, type HistoryRow } from './history';
import { buildTurnMessage, type TurnFacts } from './turn-message-builder';
import { emptyCall, respondWithAi, type AiContext, type AiResponseResult, type ResponderDependencies } from './responder';

export interface AiMessageInput {
  userId: string;
  phoneNumber: string;
  messageId: string;
  messageText: string;
  facts: TurnFacts;
  suppressExternalMessages?: boolean;
}
export type AiMessageResult = AiResponseResult | { kind: 'duplicate' };
export interface AiHandlerDependencies extends ResponderDependencies {
  config(): Promise<ResponderConfig>;
  context(): Promise<AiContext>;
  hasIncoming(messageId: string): Promise<boolean>;
  countMessages(phone: string, since: Date): Promise<number>;
  history(userId: string): Promise<HistoryRow[]>;
  saveIncoming(input: AiMessageInput): Promise<void>;
}

async function defaultDependencies(input: AiMessageInput): Promise<AiHandlerDependencies> {
  const [{ conversationRepository }, { aiModelCallRepository }, { buildAiContext }, { createToolActions }] = await Promise.all([
    import('@/data/repositories/conversation.repository'),
    import('@/data/repositories/ai-model-call.repository'),
    import('./context-builder'), import('./runtime-tools'),
  ]);
  return {
    // La clave se comprueba al llamar, después de idempotencia y límite de frecuencia.
    client: { create: (params, timeout) => createResponderClient().create(params, timeout) },
    config: loadResponderConfig, context: buildAiContext,
    hasIncoming: id => conversationRepository.hasIncomingMessage(id),
    countMessages: (phone, since) => aiModelCallRepository.countMessagesForPhone(phone, since),
    history: userId => conversationRepository.getRecentConversations(userId, 10),
    saveIncoming: async message => {
      await conversationRepository.saveIncomingMessage(message.userId, message.messageId, message.messageText);
    },
    log: call => aiModelCallRepository.save(call), tools: createToolActions(input),
  };
}

/** El llamador ejecuta el camino léxico completo solo con kind=fallback.
 * La entrada se guarda aquí al responder; en respaldo la guarda el camino léxico.
 * Los salientes siguen siendo responsabilidad del transporte/simulador existente.
 */
export async function handleAiMessage(input: AiMessageInput, injected?: AiHandlerDependencies): Promise<AiMessageResult> {
  try {
    const deps = injected || await defaultDependencies(input);
    if (await deps.hasIncoming(input.messageId)) return { kind: 'duplicate' };
    const config = await deps.config();
    const now = deps.now?.() ?? Date.now();
    const count = await deps.countMessages(input.phoneNumber, new Date(now - 3_600_000));
    if (count >= config.messagesPerHour) {
      const call = emptyCall({ ...input, config, context: { contextSizeChars: 0 } });
      call.fallback_reason = 'rate_limit';
      call.guards_applied = [{ guard: 'rate_limit', count, limit: config.messagesPerHour }];
      await deps.log(call);
      return { kind: 'fallback', reason: 'rate_limit' };
    }
    const context = await deps.context();
    const messages = buildHistory(await deps.history(input.userId), input.messageId);
    appendUserMessage(messages, input.messageText);
    messages.push(buildTurnMessage({ ...input.facts, shouldOfferAppointment: input.facts.shouldOfferAppointment
      && context.developments.some(item => item.hasAppointments) }));
    const result = await respondWithAi({ ...input, config, context, messages }, deps);
    if (result.kind === 'response') await deps.saveIncoming(input);
    return result;
  } catch (error) {
    console.error('Falló la preparación o persistencia del turno con IA:', error);
    return { kind: 'fallback', reason: 'handler_error', errorType: error instanceof Error ? error.name : 'UnknownError' };
  }
}
