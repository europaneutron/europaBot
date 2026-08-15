/**
 * Repository para gestión de intenciones y respuestas (Server-side)
 */

import { supabaseServer } from '@/services/supabase/server-client';
import type { FragmentedResponse } from '@/types/message-fragments.types';
import { normalizeResponseWrite } from '@/lib/utils/response-blocks';

export interface IntentConfiguration {
  id: string;
  scope_id: string | null;
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
  is_strong_signal: boolean;
  created_at: string;
  updated_at: string;
}

export interface BotResponse {
  id: string;
  intent_id: string;
  intent_name?: string;
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

type CreateIntentConfiguration = Omit<
  IntentConfiguration,
  'id' | 'scope_id' | 'created_at' | 'updated_at'
> & { scope_id?: string | null };

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
  async getByName(intentName: string, scopeId?: string | null): Promise<IntentConfiguration | null> {
    const { data, error } = await supabaseServer
      .from('intent_configurations')
      .select('*')
      .eq('intent_name', intentName);

    if (error) {
      console.error(`Error fetching intent "${intentName}":`, error);
      return null;
    }

    const { scopeRepository } = await import('@/data/repositories/scope.repository');
    try {
      const [intent] = await scopeRepository.resolveRows<IntentConfiguration>(
        data || [],
        scopeId,
        row => row.intent_name
      );
      return intent || null;
    } catch (resolutionError) {
      // La resolución lanza si el alcance no existe. El contrato de este método
      // es devolver null cuando no hay intención, y quien lo llama ya trata ese
      // caso; propagar aquí convertiría un dato inconsistente en una excepción
      // sin manejar.
      console.error(`Error resolving scope for intent "${intentName}":`, resolutionError);
      return null;
    }
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
  async create(data: CreateIntentConfiguration): Promise<IntentConfiguration> {
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
  async getResponsesByIntentId(intentId: string): Promise<BotResponse[]> {
    const { data, error } = await supabaseServer
      .from('bot_responses')
      .select('*')
      .eq('intent_id', intentId)
      .order('order_priority', { ascending: true });

    if (error) {
      console.error(`Error fetching responses for intent id "${intentId}":`, error);
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
