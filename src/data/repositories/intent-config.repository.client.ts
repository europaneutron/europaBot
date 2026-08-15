/**
 * Repository para gestión de intenciones y respuestas (Client-side)
 */

import { supabase } from '@/services/supabase/client';
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

export class IntentConfigRepositoryClient {
  /**
   * Obtener todas las intenciones
   */
  async getAll(): Promise<IntentConfiguration[]> {
    const { data, error } = await supabase
      .from('intent_configurations')
      .select('*')
      .order('priority', { ascending: false })
      .order('display_name', { ascending: true });

    if (error) {
      console.error('Error fetching intent configs:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Obtener intención por ID
   */
  async getById(id: string): Promise<IntentConfiguration | null> {
    const { data, error } = await supabase
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
   * Avisa al servidor que sus cachés de intenciones quedaron obsoletas.
   *
   * El dashboard escribe directamente contra Supabase desde el navegador, así
   * que el proceso servidor no se entera de la edición y seguiría respondiendo
   * con lo cacheado hasta que expire. Un fallo aquí no debe romper el guardado:
   * la caché expira sola, solo que más tarde.
   */
  private async notifyServerCacheStale(): Promise<void> {
    try {
      const response = await fetch('/api/intents/refresh', { method: 'POST' });
      if (!response.ok) {
        // Un 401 por sesión expirada no rompe el guardado, pero sí deja al bot
        // sirviendo lo cacheado hasta que expire. Registrarlo es lo que permite
        // distinguir "el cambio no se aplicó" de "el cambio no se guardó".
        console.error(
          `No fue posible invalidar la caché de intenciones (HTTP ${response.status})`
        );
      }
    } catch (error) {
      console.error('No fue posible invalidar la caché de intenciones:', error);
    }
  }

  /**
   * Crear nueva intención
   */
  async create(data: CreateIntentConfiguration): Promise<IntentConfiguration> {
    const { data: intent, error } = await supabase
      .from('intent_configurations')
      .insert(data)
      .select()
      .single();

    if (error) {
      console.error('Error creating intent:', error);
      throw error;
    }

    await this.notifyServerCacheStale();

    return intent;
  }

  /**
   * Actualizar intención existente
   */
  async update(id: string, data: Partial<IntentConfiguration>): Promise<void> {
    const { error } = await supabase
      .from('intent_configurations')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error(`Error updating intent ${id}:`, error);
      throw error;
    }

    await this.notifyServerCacheStale();
  }

  /**
   * Eliminar intención (desactivar)
   */
  async delete(id: string): Promise<void> {
    await this.update(id, { is_active: false });
  }

  /**
   * Obtener respuestas de una intención
   */
  async getResponsesByIntentId(intentId: string): Promise<BotResponse[]> {
    const { data, error } = await supabase
      .from('bot_responses')
      .select('*')
      .eq('intent_id', intentId)
      .order('order_priority', { ascending: true });

    if (error) {
      console.error(`Error fetching responses for intent id "${intentId}":`, error);
      throw error;
    }

    return data || [];
  }

  /**
   * Crear respuesta para una intención
   */
  async createResponse(data: Omit<BotResponse, 'id' | 'created_at' | 'updated_at'>): Promise<BotResponse> {
    const { data: response, error } = await supabase
      .from('bot_responses')
      .insert(normalizeResponseWrite(data))
      .select()
      .single();

    if (error) {
      console.error('Error creating response:', error);
      throw error;
    }

    await this.notifyServerCacheStale();

    return response;
  }

  /**
   * Actualizar respuesta
   */
  async updateResponse(id: string, data: Partial<BotResponse>): Promise<void> {
    const { error } = await supabase
      .from('bot_responses')
      .update({ ...normalizeResponseWrite(data), updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error(`Error updating response ${id}:`, error);
      throw error;
    }

    await this.notifyServerCacheStale();
  }

  /**
   * Eliminar respuesta
   */
  async deleteResponse(id: string): Promise<void> {
    const { error } = await supabase
      .from('bot_responses')
      .delete()
      .eq('id', id);

    if (error) {
      console.error(`Error deleting response ${id}:`, error);
      throw error;
    }

    await this.notifyServerCacheStale();
  }
}

export const intentConfigRepositoryClient = new IntentConfigRepositoryClient();
