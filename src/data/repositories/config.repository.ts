/**
 * Repository para configuración dinámica del bot
 * Permite leer y actualizar configuraciones desde bot_config
 */

import { supabaseServer } from '@/services/supabase/server-client';

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
    const { data, error } = await supabaseServer
      .from('bot_config')
      .select('config_value')
      .eq('config_key', key)
      .single();

    if (error || !data) {
      console.warn(`Config key "${key}" not found, using default: "${defaultValue}"`);
      return defaultValue;
    }

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
  }

  /**
   * Obtener todas las configuraciones (para dashboard)
   */
  async getAll(): Promise<BotConfig[]> {
    const { data, error } = await supabaseServer
      .from('bot_config')
      .select('*')
      .order('category', { ascending: true })
      .order('config_key', { ascending: true });

    if (error) {
      console.error('Error fetching all configs:', error);
      return [];
    }

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
  }
}

export const configRepository = new ConfigRepository();
