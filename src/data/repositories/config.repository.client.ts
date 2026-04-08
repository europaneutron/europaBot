/**
 * Repository para configuración dinámica del bot (Client-side)
 * Para uso en componentes de React Client Components
 */

import { supabase } from '@/services/supabase/client';

// Cache en memoria con TTL para evitar queries repetidas desde el cliente
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 30_000; // 30 segundos

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() - entry.ts > CACHE_TTL) {
    if (entry) cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, ts: Date.now() });
}

function invalidateCache(): void {
  cache.clear();
}

export interface BotConfig {
  id: string;
  config_key: string;
  config_value: string;
  config_type: 'string' | 'integer' | 'boolean' | 'json';
  description: string | null;
  category: string;
  is_editable: boolean;
  created_at: string;
  updated_at: string;
}

export class ConfigRepositoryClient {
  /**
   * Obtener todas las configuraciones
   */
  async getAll(): Promise<BotConfig[]> {
    const cached = getCached<BotConfig[]>('config:__all__');
    if (cached) return cached;

    const { data, error } = await supabase
      .from('bot_config')
      .select('*')
      .order('category', { ascending: true })
      .order('config_key', { ascending: true });

    if (error) {
      console.error('Error fetching all configs:', error);
      throw error;
    }

    const result = data || [];
    setCache('config:__all__', result);
    return result;
  }

  /**
   * Actualizar múltiples configuraciones (batch update)
   */
  async updateMultiple(updates: Array<{ key: string; value: string }>): Promise<void> {
    for (const { key, value } of updates) {
      const { error } = await supabase
        .from('bot_config')
        .update({ 
          config_value: value,
          updated_at: new Date().toISOString()
        })
        .eq('config_key', key);

      if (error) {
        console.error(`Error updating config key "${key}":`, error);
        throw error;
      }
    }

    invalidateCache();
  }
}

export const configRepositoryClient = new ConfigRepositoryClient();
