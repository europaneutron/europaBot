/**
 * Repository para gestión de intenciones y respuestas (Server-side)
 */

import { supabaseServer } from '@/services/supabase/server-client';
import type { FragmentedResponse } from '@/types/message-fragments.types';
import { normalizeResponseWrite } from '@/lib/utils/response-blocks';

export interface IntentConfiguration {
  id: string;
  intent_name: string;
  display_name: string;
  keywords: string[];
  synonyms: string[];
  typos: string[];
  phrases: string[];
  min_confidence: number;
  priority: number;
  response_template: string | null;
  response_type: string;
  is_active: boolean;
  is_checkpoint: boolean;
  created_at: string;
  updated_at: string;
}

export interface BotResponse {
  id: string;
  intent_name: string;
  response_key: string;
  message_text: string | FragmentedResponse | null;
  media_url: string | null;
  response_type: string;
  variables: any;
  is_active: boolean;
  order_priority: number;
  created_at: string;
  updated_at: string;
}

export class IntentConfigRepository {
  /**
   * Obtener todas las intenciones
   */
  async getAll(): Promise<IntentConfiguration[]> {
    const { data, error } = await supabaseServer
      .from('intent_configurations')
      .select('*')
      .order('priority', { ascending: false })
      .order('display_name', { ascending: true });

    if (error) {
      console.error('Error fetching intent configs:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Obtener intención por nombre
   */
  async getByName(intentName: string): Promise<IntentConfiguration | null> {
    const { data, error } = await supabaseServer
      .from('intent_configurations')
      .select('*')
      .eq('intent_name', intentName)
      .single();

    if (error) {
      console.error(`Error fetching intent "${intentName}":`, error);
      return null;
    }

    return data;
  }

  /**
   * Obtener intención por ID
   */
  async getById(id: string): Promise<IntentConfiguration | null> {
    const { data, error } = await supabaseServer
      .from('intent_configurations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error(`Error fetching intent with id "${id}":`, error);
      return null;
    }

    return data;
  }

  /**
   * Crear nueva intención
   */
  async create(data: Omit<IntentConfiguration, 'id' | 'created_at' | 'updated_at'>): Promise<IntentConfiguration> {
    const { data: intent, error } = await supabaseServer
      .from('intent_configurations')
      .insert(data)
      .select()
      .single();

    if (error) {
      console.error('Error creating intent:', error);
      throw error;
    }

    return intent;
  }

  /**
   * Actualizar intención existente
   */
  async update(id: string, data: Partial<IntentConfiguration>): Promise<void> {
    const { error } = await supabaseServer
      .from('intent_configurations')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error(`Error updating intent ${id}:`, error);
      throw error;
    }
  }

  /**
   * Eliminar intención (desactivar)
   */
  async delete(id: string): Promise<void> {
    // No eliminar físicamente, solo desactivar
    await this.update(id, { is_active: false });
  }

  /**
   * Obtener respuestas de una intención
   */
  async getResponsesByIntent(intentName: string): Promise<BotResponse[]> {
    const { data, error } = await supabaseServer
      .from('bot_responses')
      .select('*')
      .eq('intent_name', intentName)
      .order('order_priority', { ascending: true });

    if (error) {
      console.error(`Error fetching responses for "${intentName}":`, error);
      return [];
    }

    return data || [];
  }

  /**
   * Crear respuesta para una intención
   */
  async createResponse(data: Omit<BotResponse, 'id' | 'created_at' | 'updated_at'>): Promise<BotResponse> {
    const { data: response, error } = await supabaseServer
      .from('bot_responses')
      .insert(normalizeResponseWrite(data))
      .select()
      .single();

    if (error) {
      console.error('Error creating response:', error);
      throw error;
    }

    return response;
  }

  /**
   * Actualizar respuesta
   */
  async updateResponse(id: string, data: Partial<BotResponse>): Promise<void> {
    const { error } = await supabaseServer
      .from('bot_responses')
      .update({ ...normalizeResponseWrite(data), updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error(`Error updating response ${id}:`, error);
      throw error;
    }
  }

  /**
   * Eliminar respuesta
   */
  async deleteResponse(id: string): Promise<void> {
    const { error } = await supabaseServer
      .from('bot_responses')
      .delete()
      .eq('id', id);

    if (error) {
      console.error(`Error deleting response ${id}:`, error);
      throw error;
    }
  }
}

export const intentConfigRepository = new IntentConfigRepository();
