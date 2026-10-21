import type { AiTopicClassification } from '@/data/models/ai-topic-classification.model';
import type { ScoreSource } from '@/services/anthropic/client';
import type { ClassificationOutput } from './topic-classifier';

export interface MatcherSignal {
  /** Temas checkpoint de todas las coincidencias, solo para comparar detectores. */
  topics: string[];
  /** La coincidencia principal: la única que el camino léxico convierte en checkpoint. */
  top: { intentName: string; isCheckpoint: boolean } | null;
}

export interface TopicScoringDependencies {
  saveClassification(row: Omit<AiTopicClassification, 'id' | 'created_at'>): Promise<void>;
  isCheckpointCompleted(userId: string, scopeId: string, intentName: string): Promise<boolean>;
  markCheckpoint(userId: string, scopeId: string, intentName: string, mentionedScopeId?: string | null): Promise<void>;
  recalculate(userId: string, scopeId: string): Promise<void>;
}

export interface TopicOutcomeInput {
  userId: string;
  messageId: string;
  classification: ClassificationOutput;
  matcher: MatcherSignal | null;
  scoreSource: ScoreSource;
  /** Con respaldo, el camino léxico ya puntúa el mensaje: aquí solo se registra. */
  replied: boolean;
  rootScopeId: string;
}

/**
 * Una fila por mensaje y, según la fuente, los checkpoints del lead. Cada paso
 * falla por separado y sin lanzar: ni el registro ni el score pueden afectar a
 * la respuesta, que a estas alturas ya salió o va a salir con su propio resultado.
 */
export const MATCHER_SCORE_FALLBACK_MARK = 'score_from_matcher';

export async function recordTopicOutcome(input: TopicOutcomeInput, deps: TopicScoringDependencies): Promise<string[]> {
  // Con fuente classifier y un clasificador caído, el mensaje no puede quedar sin puntuar:
  // se usa lo que vio el matcher y la fila lo deja dicho junto a la causa del fallo.
  const useMatcherScore = input.replied && input.scoreSource === 'classifier' && input.classification.failureReason !== null;
  try {
    await deps.saveClassification({
      user_id: input.userId, conversation_id: null, message_id: input.messageId,
      topics: input.classification.topics, other_topic: input.classification.otherTopic,
      discarded_topics: input.classification.discarded,
      matcher_topics: input.matcher?.topics ?? [],
      failure_reason: useMatcherScore
        ? `${input.classification.failureReason}+${MATCHER_SCORE_FALLBACK_MARK}`
        : input.classification.failureReason,
    });
  } catch (error) {
    console.error('No se pudo guardar la clasificación de temas:', error);
  }
  if (!input.replied) return [];

  // El matcher puntúa solo su coincidencia principal, igual que el camino léxico;
  // el clasificador puntúa cada tema claro, con el desarrollo que mencionó. Si el
  // clasificador falló, se puntúa como el matcher.
  const candidates = input.scoreSource === 'classifier' && !useMatcherScore
    ? input.classification.topics.filter(topic => topic.clarity === 'clara')
      .map(topic => ({ intentName: topic.intent_name, mentionedScopeId: topic.mentioned_scope_id as string | null | undefined }))
    : input.matcher?.top?.isCheckpoint
      ? [{ intentName: input.matcher.top.intentName, mentionedScopeId: undefined }] : [];
  const written: string[] = [];
  try {
    for (const candidate of candidates) {
      // El alcance raíz hace que la restricción existente cuente cada tema una vez por lead.
      if (await deps.isCheckpointCompleted(input.userId, input.rootScopeId, candidate.intentName)) continue;
      await deps.markCheckpoint(input.userId, input.rootScopeId, candidate.intentName, candidate.mentionedScopeId);
      written.push(candidate.intentName);
    }
    if (written.length) await deps.recalculate(input.userId, input.rootScopeId);
  } catch (error) {
    console.error('No se pudieron registrar los checkpoints del camino con IA:', error);
  }
  return written;
}
