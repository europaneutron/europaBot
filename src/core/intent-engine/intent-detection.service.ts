/**
 * Intent Detection Service
 * Orquesta la detección de intenciones usando FuzzyMatcher
 * y se conecta con la base de datos
 */

import { FuzzyMatcher } from './fuzzy-matcher';
import type { IntentConfiguration, DetectionResult } from '@/types/intent.types';

export class IntentDetectionService {
  private matcher: FuzzyMatcher | null = null;
  private intentsCache: IntentConfiguration[] = [];
  private lastCacheUpdate: Date | null = null;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

  constructor() {
    // Se inicializa lazy cuando se necesita
  }

  /**
   * Carga intents desde Supabase (será implementado en repositorio)
   */
  async loadIntents(supabaseClient: any): Promise<void> {
    const { data, error } = await supabaseClient
      .from('intent_configurations')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (error) {
      console.error('Error loading intents:', error);
      throw new Error('Failed to load intent configurations');
    }

    this.intentsCache = data || [];
    this.matcher = new FuzzyMatcher(this.intentsCache);
    this.lastCacheUpdate = new Date();
  }

  /**
   * Verifica si el cache necesita actualizarse
   */
  private needsCacheRefresh(): boolean {
    if (!this.lastCacheUpdate) return true;
    
    const now = new Date();
    const elapsed = now.getTime() - this.lastCacheUpdate.getTime();
    
    return elapsed > this.CACHE_TTL_MS;
  }

  /**
   * Detecta intención en un mensaje
   */
  async detect(
    message: string,
    supabaseClient?: any
  ): Promise<DetectionResult> {
    // Si no hay matcher o el cache expiró, recargar
    if (!this.matcher || (this.needsCacheRefresh() && supabaseClient)) {
      await this.loadIntents(supabaseClient);
    }

    if (!this.matcher) {
      throw new Error('IntentDetectionService not initialized. Call loadIntents first.');
    }

    return this.matcher.detectIntent(message);
  }

  /**
   * Forzar recarga de intents (útil después de editar en dashboard)
   */
  async refresh(supabaseClient: any): Promise<void> {
    await this.loadIntents(supabaseClient);
  }

  /**
   * Obtener intent por nombre
   */
  getIntentByName(intentName: string): IntentConfiguration | undefined {
    return this.intentsCache.find(i => i.intent_name === intentName);
  }

  /**
   * Obtener todos los intents activos
   */
  getActiveIntents(): IntentConfiguration[] {
    return this.intentsCache;
  }
}

// Singleton para usar en toda la app
export const intentDetectionService = new IntentDetectionService();
