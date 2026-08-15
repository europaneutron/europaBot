/**
 * Intent Detection Service
 * Orquesta la detección de intenciones usando FuzzyMatcher
 * y se conecta con la base de datos
 */

import { FuzzyMatcher } from './fuzzy-matcher';
import type { IntentConfiguration, DetectionResult } from '@/types/intent.types';
import { ROOT_SCOPE_ID, scopeRepository } from '@/data/repositories/scope.repository';

type IntentCache = {
  matcher: FuzzyMatcher;
  intents: IntentConfiguration[];
  responseIntentIdsByName: Map<string, string[]>;
  updatedAt: number;
};

export class IntentDetectionService {
  private caches = new Map<string, IntentCache>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
  private readonly MAX_SCOPE_CACHES = 100;

  private setCache(scopeId: string | null, cache: IntentCache): void {
    const cacheKey = scopeId ?? 'global';
    this.caches.delete(cacheKey);
    this.caches.set(cacheKey, cache);

    while (this.caches.size > this.MAX_SCOPE_CACHES) {
      const oldestKey = this.caches.keys().next().value;
      if (oldestKey === undefined) break;
      this.caches.delete(oldestKey);
    }
  }

  /**
   * Carga intents desde Supabase (será implementado en repositorio)
   */
  async loadIntents(
    supabaseClient: any,
    scopeId: string | null = ROOT_SCOPE_ID
  ): Promise<IntentCache> {
    const { data, error } = await supabaseClient
      .from('intent_configurations')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (error) {
      console.error('Error loading intents:', error);
      throw new Error('Failed to load intent configurations');
    }

    const allIntents = (data || []) as IntentConfiguration[];

    // Si el árbol no se puede resolver, se degrada al alcance raíz y a lo
    // global en lugar de propagar el error. Esta es la ruta de todos los
    // mensajes entrantes: sin esta degradación, un fallo al leer `scopes`
    // haría que el bot respondiera "tuve un problema técnico" a cada mensaje.
    // Las rutas de horarios y de asesor ya degradan igual.
    let visibleIntents: IntentConfiguration[];
    let resolutionOrder: Array<string | null>;

    try {
      visibleIntents = await scopeRepository.resolveRows<IntentConfiguration>(
        allIntents,
        scopeId,
        intent => intent.intent_name,
        supabaseClient
      );
      resolutionOrder = await scopeRepository.getResolutionOrder(scopeId, supabaseClient);
    } catch (resolutionError) {
      console.error('Error resolving scope for intents; using root configuration:', resolutionError);
      resolutionOrder = [ROOT_SCOPE_ID, null];
      const fallbackByName = new Map<string, IntentConfiguration>();
      for (const fallbackScopeId of resolutionOrder) {
        for (const intent of allIntents.filter(row => row.scope_id === fallbackScopeId)) {
          if (!fallbackByName.has(intent.intent_name)) fallbackByName.set(intent.intent_name, intent);
        }
      }
      visibleIntents = Array.from(fallbackByName.values());
    }

    visibleIntents.sort((a, b) => b.priority - a.priority);
    const responseIntentIdsByName = new Map<string, string[]>();
    for (const intent of visibleIntents) {
      const intentIds = resolutionOrder.flatMap(resolvedScopeId =>
        allIntents
          .filter(candidate => (
            candidate.scope_id === resolvedScopeId &&
            candidate.intent_name === intent.intent_name
          ))
          .map(candidate => candidate.id)
      );
      responseIntentIdsByName.set(intent.intent_name, intentIds);
    }

    const cache = {
      intents: visibleIntents,
      matcher: new FuzzyMatcher(visibleIntents),
      responseIntentIdsByName,
      updatedAt: Date.now(),
    };
    if (visibleIntents.length > 0) {
      this.setCache(scopeId, cache);
    } else {
      this.caches.delete(scopeId ?? 'global');
    }
    return cache;
  }

  /**
   * Detecta intención en un mensaje
   */
  async detect(
    message: string,
    supabaseClient: any,
    scopeId: string | null = ROOT_SCOPE_ID
  ): Promise<DetectionResult> {
    const cacheKey = scopeId ?? 'global';
    let cache = this.caches.get(cacheKey);
    if (!cache || Date.now() - cache.updatedAt > this.CACHE_TTL_MS) {
      cache = await this.loadIntents(supabaseClient, scopeId);
    } else {
      this.setCache(scopeId, cache);
    }

    const detection = cache.matcher.detectIntent(message);
    const enrichIntent = (intent: NonNullable<DetectionResult['intent']>) => ({
      ...intent,
      response_intent_ids: cache.responseIntentIdsByName.get(intent.intent_name) || [intent.intent_id],
    });

    return {
      ...detection,
      intent: detection.intent ? enrichIntent(detection.intent) : undefined,
      all_matches: detection.all_matches.map(enrichIntent),
    };
  }

  async detectAcrossScopes(
    message: string,
    supabaseClient: any,
    scopeIds: string[]
  ): Promise<DetectionResult> {
    const results = await Promise.all(
      scopeIds.map(scopeId => this.detect(message, supabaseClient, scopeId))
    );
    const matches = results.flatMap(result => result.all_matches);

    matches.sort((left, right) => right.confidence - left.confidence);
    return {
      detected: matches.length > 0,
      intent: matches[0],
      normalized_message: results[0]?.normalized_message ?? message,
      all_matches: matches,
    };
  }

  /**
   * Descarta las cachés de intenciones y del árbol de alcances, sin recargar.
   *
   * La recarga ocurre sola en la siguiente detección. Existe aparte de refresh()
   * porque el dashboard escribe desde el navegador y solo necesita avisar que lo
   * cacheado quedó obsoleto: no tiene un alcance concreto que precargar, y
   * hacerlo desperdiciaría una consulta por cada edición.
   */
  invalidateAll(): void {
    this.caches.clear();
    scopeRepository.invalidateCache();
  }

  /**
   * Forzar recarga de intents (útil después de editar en dashboard)
   */
  async refresh(supabaseClient: any, scopeId: string | null = ROOT_SCOPE_ID): Promise<void> {
    this.caches.clear();
    scopeRepository.invalidateCache(supabaseClient);
    await this.loadIntents(supabaseClient, scopeId);
  }

  /**
   * Obtener intent por nombre
   */
  getIntentByName(
    intentName: string,
    scopeId: string | null = ROOT_SCOPE_ID
  ): IntentConfiguration | undefined {
    return this.caches.get(scopeId ?? 'global')?.intents.find(
      intent => intent.intent_name === intentName
    );
  }

  /**
   * Obtener todos los intents activos
   */
  getActiveIntents(scopeId: string | null = ROOT_SCOPE_ID): IntentConfiguration[] {
    return this.caches.get(scopeId ?? 'global')?.intents || [];
  }
}

// Singleton para usar en toda la app
export const intentDetectionService = new IntentDetectionService();
