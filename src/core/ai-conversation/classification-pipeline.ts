import type { ClassifierConfig, ResponderClient, ScoreSource } from '@/services/anthropic/client';
import type { NewAiModelCall } from '@/data/repositories/ai-model-call.repository';
import {
  classifyTopics, type ClassificationOutput, type ClassifierDevelopment, type PriorTurn, type TopicDefinition,
} from './topic-classifier';
import { recordTopicOutcome, type MatcherSignal, type TopicScoringDependencies } from './topic-scoring';

export interface ClassificationDependencies {
  config(): Promise<ClassifierConfig>;
  scoreSource(): Promise<ScoreSource>;
  topics(): Promise<TopicDefinition[]>;
  matcher(text: string): Promise<MatcherSignal>;
  client: ResponderClient;
  log(call: NewAiModelCall): Promise<void>;
  scoring: TopicScoringDependencies;
  rootScopeId: string;
  /** Espera máxima tras la respuesta antes de dejar al clasificador terminar por su cuenta. */
  graceMs?: number;
  now?: () => number;
}

export interface ClassificationRun {
  userId: string;
  messageId: string;
  messageText: string;
  priorTurns: PriorTurn[];
  developments: ClassifierDevelopment[];
}

export const DEFAULT_CLASSIFIER_GRACE_MS = 1500;

const failure = (reason: string): ClassificationOutput => ({ topics: [], otherTopic: null, discarded: [], failureReason: reason });

/**
 * Corre el clasificador y el matcher junto al contestador. Nunca rechaza: cada
 * falla se vuelve un registro con su causa. `replied` indica si la respuesta salió
 * por el camino con IA, porque con respaldo el camino léxico ya puntúa el mensaje.
 */
export async function runClassification(run: ClassificationRun, deps: ClassificationDependencies, replied: Promise<boolean>): Promise<void> {
  try {
    const classify = async (): Promise<ClassificationOutput> => {
      try {
        const [config, topics] = await Promise.all([deps.config(), deps.topics()]);
        return await classifyTopics({
          userId: run.userId, messageId: run.messageId, message: run.messageText, priorTurns: run.priorTurns,
          topics, developments: run.developments, config,
        }, { client: deps.client, log: deps.log, now: deps.now });
      } catch (error) {
        console.error('Falló la preparación del clasificador de temas:', error);
        return failure('config_error');
      }
    };
    const match = async (): Promise<MatcherSignal | null> => {
      try { return await deps.matcher(run.messageText); }
      catch (error) { console.error('Falló el matcher léxico en el camino con IA:', error); return null; }
    };
    const scoreSource = async (): Promise<ScoreSource> => {
      try { return await deps.scoreSource(); }
      catch (error) { console.error('No se pudo leer ai_score_source; se usa matcher:', error); return 'matcher'; }
    };
    const [classification, matcher, source] = await Promise.all([classify(), match(), scoreSource()]);
    await recordTopicOutcome({
      userId: run.userId, messageId: run.messageId, classification, matcher, scoreSource: source,
      replied: await replied, rootScopeId: deps.rootScopeId,
    }, deps.scoring);
  } catch (error) {
    console.error('Falló el registro de temas del camino con IA:', error);
  }
}

/** Espera como mucho `graceMs`; lo que falte termina en segundo plano sin retrasar la respuesta. */
export async function waitBriefly(pipeline: Promise<void>, graceMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([pipeline, new Promise<void>(resolve => { timer = setTimeout(resolve, graceMs); })]);
  if (timer) clearTimeout(timer);
}
