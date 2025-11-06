/**
 * Repository para configuración dinámica del bot (Client-side)
 * Para uso en componentes de React Client Components
 */

import { supabase } from '@/services/supabase/client';

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
    const { data, error } = await supabase
      .from('bot_config')
      .select('*')
      .order('category', { ascending: true })
      .order('config_key', { ascending: true });

    if (error) {
      console.error('Error fetching all configs:', error);
      throw error;
    }

    return data || [];
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
  }
}

export const configRepositoryClient = new ConfigRepositoryClient();
