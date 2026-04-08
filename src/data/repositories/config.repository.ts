/**
 * Repository para configuración dinámica del bot
 * Permite leer y actualizar configuraciones desde bot_config
 */

import { supabaseServer } from '@/services/supabase/server-client';

// Cache en memoria con TTL para evitar queries repetidas de config estable
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 60_000; // 60 segundos

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

function invalidateCache(key?: string): void {
  if (key) {
    cache.delete(`config:${key}`);
    cache.delete('config:__all__');
  } else {
    cache.clear();
  }
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

export class ConfigRepository {
  /**
   * Obtener valor de configuración como string
   */
  async get(key: string, defaultValue: string = ''): Promise<string> {
    const cached = getCached<string>(`config:${key}`);
    if (cached !== null) return cached;

    const { data, error } = await supabaseServer
      .from('bot_config')
      .select('config_value')
      .eq('config_key', key)
      .single();

    if (error || !data) {
      console.warn(`Config key "${key}" not found, using default: "${defaultValue}"`);
      return defaultValue;
    }

    setCache(`config:${key}`, data.config_value);
    return data.config_value;
  }

  /**
   * Obtener valor como integer
   */
  async getInt(key: string, defaultValue: number = 0): Promise<number> {
    const value = await this.get(key, defaultValue.toString());
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Obtener valor como boolean
   */
  async getBoolean(key: string, defaultValue: boolean = false): Promise<boolean> {
    const value = await this.get(key, defaultValue.toString());
    return value.toLowerCase() === 'true';
  }

  /**
   * Obtener valor como JSON
   */
  async getJson<T>(key: string, defaultValue: T): Promise<T> {
    const value = await this.get(key, JSON.stringify(defaultValue));
    try {
      return JSON.parse(value) as T;
    } catch {
      console.warn(`Failed to parse JSON for key "${key}", using default`);
      return defaultValue;
    }
  }

  /**
   * Actualizar valor de configuración
   */
  async set(key: string, value: string): Promise<void> {
    const { error } = await supabaseServer
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

    invalidateCache(key);
  }

  /**
   * Obtener todas las configuraciones (para dashboard)
   */
  async getAll(): Promise<BotConfig[]> {
    const cached = getCached<BotConfig[]>('config:__all__');
    if (cached) return cached;

    const { data, error } = await supabaseServer
      .from('bot_config')
      .select('*')
      .order('category', { ascending: true })
      .order('config_key', { ascending: true });

    if (error) {
      console.error('Error fetching all configs:', error);
      return [];
    }

    const result = data || [];
    setCache('config:__all__', result);
    return result;

    return data || [];
  }

  /**
   * Obtener configuraciones por categoría
   */
  async getByCategory(category: string): Promise<BotConfig[]> {
    const { data, error } = await supabaseServer
      .from('bot_config')
      .select('*')
      .eq('category', category)
      .order('config_key', { ascending: true });

    if (error) {
      console.error(`Error fetching configs for category "${category}":`, error);
      return [];
    }

    return data || [];
  }

  /**
   * Actualizar múltiples configuraciones (batch update)
   */
  async updateMultiple(updates: Array<{ key: string; value: string }>): Promise<void> {
    for (const { key, value } of updates) {
      await this.set(key, value);
    }
    invalidateCache();
  }
}

export const configRepository = new ConfigRepository();
