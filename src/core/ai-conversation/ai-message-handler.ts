import { createResponderClient, loadResponderConfig, type ResponderConfig } from '@/services/anthropic/client';
import { appendUserMessage, buildHistory, historySinceBooking, recentTurns, type HistoryRow } from './history';
import { buildTurnMessage, type TurnFacts } from './turn-message-builder';
import { runClassification, type ClassificationDependencies } from './classification-pipeline';
import { emptyCall, respondWithAi, type AiContext, type AiResponseResult, type ResponderDependencies } from './responder';

export interface AiMessageInput {
  userId: string;
  phoneNumber: string;
  messageId: string;
  messageText: string;
  /** `shouldOfferAppointment` lo decide el manejador con `offer`; aquí solo se acepta como forzado. */
  facts: TurnFacts;
  referralAdId?: string;
  suppressExternalMessages?: boolean;
}
/** En `response`, `afterSend` viaja dentro de `response`; en `fallback`, junto a la causa. */
export type AiMessageResult = AiResponseResult | { kind: 'duplicate' };
export interface OfferDependencies {
  evaluate(userId: string): Promise<boolean>;
  mark(userId: string): Promise<void>;
}
/** Cola por usuario: un turno espera a que terminen los anteriores del mismo usuario (D12). */
export interface TurnQueueDependencies {
  enqueue(userId: string, messageId: string): Promise<void>;
  isNext(userId: string, messageId: string): Promise<boolean>;
  release(messageId: string): Promise<void>;
  sleep?(ms: number): Promise<void>;
  /** Espera máxima antes de contestar sin orden; debe caber en la ventana síncrona del webhook. */
  maxWaitMs?: number;
  pollMs?: number;
}

export interface AiHandlerDependencies extends ResponderDependencies {
  /** Sin esto los turnos de un mismo usuario no se serializan (pruebas puras). */
  turnQueue?: TurnQueueDependencies;
  config(): Promise<ResponderConfig>;
  context(): Promise<AiContext>;
  hasIncoming(messageId: string): Promise<boolean>;
  countMessages(phone: string, since: Date): Promise<number>;
  history(userId: string): Promise<HistoryRow[]>;
  saveIncoming(input: AiMessageInput): Promise<void>;
  /** Sin esto no hay clasificación: los contestadores probados sin ella siguen igual. */
  classification?: ClassificationDependencies;
  /** Sin esto el turno no evalúa oferta de cita (los contestadores probados sin ella siguen igual). */
  offer?: OfferDependencies;
}

async function defaultClassification(client: ResponderDependencies['client'], log: ResponderDependencies['log']): Promise<ClassificationDependencies> {
  const [
    { loadClassifierConfig, loadScoreSource }, { intentConfigRepository }, { aiTopicClassificationRepository },
    { userRepository }, { ROOT_SCOPE_ID, scopeRepository }, { leadScorer }, { intentDetectionService }, { supabaseServer },
  ] = await Promise.all([
    import('@/services/anthropic/client'), import('@/data/repositories/intent-config.repository'),
    import('@/data/repositories/ai-topic-classification.repository'), import('@/data/repositories/user.repository'),
    import('@/data/repositories/scope.repository'), import('@/core/scoring'),
    import('@/core/intent-engine'), import('@/services/supabase/server-client'),
  ]);
  return {
    config: loadClassifierConfig, scoreSource: loadScoreSource, client, log, rootScopeId: ROOT_SCOPE_ID,
    topics: async () => (await intentConfigRepository.listActiveCheckpointTopics()).map(row => ({
      name: row.intent_name, description: row.display_name,
      examples: (row.phrases.length ? row.phrases : row.keywords).map(text => text.replace(/^[¿]+|[?]+$/g, '').trim()).filter(Boolean),
    })),
    matcher: async text => {
      // Sin foco el camino léxico busca en todos los alcances alcanzables; aquí tampoco hay foco.
      const reachable = Array.from(await scopeRepository.getReachableScopeIds());
      const detection = await intentDetectionService.detectAcrossScopes(text, supabaseServer, reachable.length ? reachable : [ROOT_SCOPE_ID]);
      const topics = Array.from(new Set(detection.all_matches.filter(match => match.is_checkpoint).map(match => match.intent_name)));
      const top = detection.intent ? { intentName: detection.intent.intent_name, isCheckpoint: detection.intent.is_checkpoint === true } : null;
      return { topics, top };
    },
    scoring: {
      saveClassification: row => aiTopicClassificationRepository.save(row),
      isCheckpointCompleted: (userId, scopeId, intent) => userRepository.isCheckpointCompleted(userId, scopeId, intent),
      markCheckpoint: (userId, scopeId, intent, mentioned) => userRepository.markCheckpointCompleted(userId, scopeId, intent, mentioned),
      recalculate: (userId, scopeId) => leadScorer.afterCheckpointCompleted(userId, scopeId),
    },
  };
}

async function defaultOffer(): Promise<OfferDependencies> {
  const [{ evaluateAppointmentOffer, createOfferEvaluationDependencies }, { userRepository }, { ROOT_SCOPE_ID }] = await Promise.all([
    import('./appointment-offer-evaluation'), import('@/data/repositories/user.repository'),
    import('@/data/repositories/scope.repository'),
  ]);
  const evaluation = await createOfferEvaluationDependencies();
  return {
    evaluate: userId => evaluateAppointmentOffer(userId, evaluation),
    // Mismo alcance (raíz) con el que la evaluación lee si ya se ofreció.
    mark: userId => userRepository.markAppointmentOffered(userId, ROOT_SCOPE_ID),
  };
}

const TURN_STALE_SECONDS = 30;
const TURN_MAX_WAIT_MS = 5_000;
const TURN_POLL_MS = 200;

async function defaultTurnQueue(): Promise<TurnQueueDependencies> {
  const { aiTurnQueueRepository } = await import('@/data/repositories/ai-turn-queue.repository');
  return {
    enqueue: (userId, messageId) => aiTurnQueueRepository.enqueue(userId, messageId, TURN_STALE_SECONDS),
    isNext: (userId, messageId) => aiTurnQueueRepository.isNext(userId, messageId, TURN_STALE_SECONDS),
    release: messageId => aiTurnQueueRepository.release(messageId),
  };
}

/** Devuelve si el turno quedó en la cola; si la cola falla o la espera se agota, el turno sigue sin ella. */
async function waitForTurn(queue: TurnQueueDependencies, input: AiMessageInput): Promise<boolean> {
  try {
    await queue.enqueue(input.userId, input.messageId);
  } catch (error) {
    console.error('No se pudo encolar el turno con IA; se contesta sin orden:', error);
    return false;
  }
  const sleep = queue.sleep ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const deadline = Date.now() + (queue.maxWaitMs ?? TURN_MAX_WAIT_MS);
  try {
    while (!(await queue.isNext(input.userId, input.messageId))) {
      if (Date.now() >= deadline) {
        console.error('El turno anterior del mismo usuario no terminó a tiempo; se contesta sin esperarlo.');
        break;
      }
      await sleep(queue.pollMs ?? TURN_POLL_MS);
    }
  } catch (error) {
    console.error('No se pudo consultar la cola de turnos; se contesta sin orden:', error);
  }
  return true;
}

async function defaultDependencies(input: AiMessageInput): Promise<AiHandlerDependencies> {
  const [{ conversationRepository }, { aiModelCallRepository }, { buildAiContext }, { createToolActions }] = await Promise.all([
    import('@/data/repositories/conversation.repository'),
    import('@/data/repositories/ai-model-call.repository'),
    import('./context-builder'), import('./runtime-tools'),
  ]);
  // La clave se comprueba al llamar, después de idempotencia y límite de frecuencia.
  const client: ResponderDependencies['client'] = { create: (params, timeout) => createResponderClient().create(params, timeout) };
  const log: ResponderDependencies['log'] = call => aiModelCallRepository.save(call);
  return {
    client,
    config: loadResponderConfig, context: buildAiContext,
    hasIncoming: id => conversationRepository.hasIncomingMessage(id),
    countMessages: (phone, since) => aiModelCallRepository.countMessagesForPhone(phone, since),
    history: userId => conversationRepository.getRecentConversations(userId, 10),
    saveIncoming: async message => {
      await conversationRepository.saveIncomingMessage(
        message.userId, message.messageId, message.messageText, undefined, { referralAdId: message.referralAdId });
    },
    log, tools: createToolActions(input),
    classification: await defaultClassification(client, log),
    offer: await defaultOffer(),
    turnQueue: await defaultTurnQueue(),
  };
}

/** El llamador ejecuta el camino léxico completo solo con kind=fallback.
 * La entrada se guarda aquí al responder; en respaldo la guarda el camino léxico.
 * Los salientes siguen siendo responsabilidad del transporte/simulador existente.
 * Con `response` o `fallback`, el llamador espera `afterSend` después de enviar.
 */
export async function handleAiMessage(input: AiMessageInput, injected?: AiHandlerDependencies): Promise<AiMessageResult> {
  let pipeline: Promise<void> | null = null;
  const withPipeline = <T extends AiMessageResult>(result: T): T => {
    if (!pipeline) return result;
    if (result.kind === 'fallback') return { ...result, afterSend: pipeline };
    if (result.kind === 'response') return { ...result, response: { ...result.response, afterSend: pipeline } };
    return result;
  };
  let queue: TurnQueueDependencies | null = null;
  try {
    const deps = injected || await defaultDependencies(input);
    if (deps.turnQueue && await waitForTurn(deps.turnQueue, input)) queue = deps.turnQueue;
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
    const allHistoryRows = await deps.history(input.userId);
    const historyRows = historySinceBooking(allHistoryRows, input.facts.appointment?.bookedAt);
    const messages = buildHistory(historyRows, input.messageId);
    appendUserMessage(messages, input.messageText);
    // La oferta se evalúa con lo ya guardado, antes de llamar al modelo (D10). Sin
    // desarrollo con horarios no hay a dónde invitar, así que tampoco hay nota ni marca.
    const wantsOffer = input.facts.shouldOfferAppointment || await evaluateOffer(deps, input.userId);
    const offerNote = wantsOffer && context.developments.some(item => item.hasAppointments);
    messages.push(buildTurnMessage({ ...input.facts, shouldOfferAppointment: offerNote }));
    // El clasificador y el matcher corren junto al contestador y nunca lo esperan:
    // `replied` solo les dice después si la respuesta salió por este camino.
    let settleReply: (replied: boolean) => void = () => {};
    const replied = new Promise<boolean>(resolve => { settleReply = resolve; });
    pipeline = deps.classification
      ? runClassification({
        userId: input.userId, messageId: input.messageId, messageText: input.messageText,
        priorTurns: recentTurns(historyRows, input.messageId),
        developments: context.developments.map(item => ({ id: item.id, name: item.name })),
      }, deps.classification, replied)
      : null;
    try {
      // Las cifras que escribió el lead valen aunque las haya escrito antes de agendar.
      const leadTexts = [input.messageText, ...allHistoryRows
        .filter(row => ['inbound', 'incoming'].includes(row.direction) && row.message_id !== input.messageId)
        .map(row => row.message_text ?? '')];
      const result = await respondWithAi({ ...input, config, context, messages, leadTexts }, deps);
      settleReply(result.kind === 'response');
      if (result.kind === 'response') {
        await deps.saveIncoming(input);
        // Antes de enviar, como el camino léxico: un reintento no puede ofrecer dos veces.
        if (offerNote && deps.offer) await markOffer(deps.offer, input.userId);
      }
      return withPipeline(result);
    } finally {
      settleReply(false);
    }
  } catch (error) {
    console.error('Falló la preparación o persistencia del turno con IA:', error);
    return withPipeline({ kind: 'fallback', reason: 'handler_error', errorType: error instanceof Error ? error.name : 'UnknownError' });
  } finally {
    // Aquí la entrada ya está guardada (o el turno cae al camino léxico): el siguiente la verá.
    if (queue) await queue.release(input.messageId).catch(error => console.error('No se pudo liberar el turno con IA; vence solo:', error));
  }
}

async function evaluateOffer(deps: AiHandlerDependencies, userId: string): Promise<boolean> {
  if (!deps.offer) return false;
  try { return await deps.offer.evaluate(userId); }
  catch (error) { console.error('No se pudo evaluar la oferta de cita; el turno sale sin ella:', error); return false; }
}

async function markOffer(offer: OfferDependencies, userId: string): Promise<void> {
  try { await offer.mark(userId); }
  catch (error) { console.error('No se pudo marcar la oferta de cita como hecha:', error); }
}
