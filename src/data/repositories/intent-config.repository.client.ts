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

export interface ResponseButton {
  /**
   * Lo que se lee en la opcion. Con tres o menos se manda como boton (veinte
   * caracteres); con cuatro o mas, como fila de lista (veinticuatro).
   */
  label: string;
  /** La pregunta que dispara, o "cita" para abrir el flujo de agendamiento. */
  intentName: string;
  /**
   * A que fraccionamiento mueve el foco al tocarlo. Sin esto, la opcion
   * contesta en el alcance donde ya esta la conversacion, que es lo normal.
   * Con esto, "¿te platico de Europa?" lleva a Europa y contesta ahi.
   */
  scopeId?: string | null;
  /**
   * Solo se ve si esto termina mandandose como lista (cuatro o mas): un
   * boton de WhatsApp no tiene donde ponerla.
   */
  description?: string;
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
  origin: 'manual' | 'compiler';
  compiler_proposal_id: string | null;
  review_signals: string[];
  /**
   * Botones declarados por quien escribio la respuesta. `null` deja que el
   * sistema los componga con las preguntas vivas del alcance.
   */
  buttons: ResponseButton[] | null;
  edited_by_human: boolean;
  superseded_by_response_id: string | null;
  deactivated_at: string | null;
  response_fact_dependencies?: Array<{
    compiler_facts: {
      material_id: string;
      page_number: number;
      fact_key: string;
      compiler_materials: { original_filename: string } | null;
    } | null;
  }>;
  created_at: string;
  updated_at: string;
}

type CreateIntentConfiguration = Omit<
  IntentConfiguration,
  'id' | 'scope_id' | 'created_at' | 'updated_at'
> & { scope_id?: string | null };

type CreateBotResponse = Omit<
  BotResponse,
  'id' | 'created_at' | 'updated_at' | 'origin' | 'compiler_proposal_id' |
  'review_signals' | 'response_fact_dependencies' | 'edited_by_human' |
  'superseded_by_response_id' | 'deactivated_at'
> & Partial<Pick<BotResponse, 'origin' | 'compiler_proposal_id'>>;

export class IntentConfigRepositoryClient {
  private async assertActiveSlotAvailable(intentId: string, excludeId?: string): Promise<void> {
    let query = supabase
      .from('bot_responses')
      .select('id', { count: 'exact', head: true })
      .eq('intent_id', intentId)
      .eq('is_active', true);
    if (excludeId) query = query.neq('id', excludeId);
    const { count, error } = await query;
    if (error) throw error;
    if ((count || 0) > 0) {
      throw new Error('Esta pregunta ya tiene una respuesta activa en el alcance');
    }
  }

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
   * Todas las filas de una pregunta, una por alcance. Es el arbol: misma
   * `intent_name`, distinto `scope_id`.
   */
  async getByIntentName(intentName: string): Promise<IntentConfiguration[]> {
    const { data, error } = await supabase
      .from('intent_configurations')
      .select('*')
      .eq('intent_name', intentName);

    if (error) {
      console.error(`Error fetching intents for intent_name "${intentName}":`, error);
      throw error;
    }

    return data || [];
  }

  /**
   * Borra la fila propia de un alcance para una pregunta. A diferencia de
   * `delete()` -- que archiva, no borra -- esto es lo que hace que el
   * alcance vuelva a heredar: "hereda" es la ausencia de fila, no una marca.
   * Arrastra en cascada sus respuestas y sus dependencias de hechos.
   */
  async deleteOwnResponse(id: string): Promise<void> {
    const { error } = await supabase
      .from('intent_configurations')
      .delete()
      .eq('id', id);

    if (error) {
      console.error(`Error deleting intent configuration ${id}:`, error);
      throw error;
    }

    await this.notifyServerCacheStale();
  }

  /**
   * Respuestas de varias intenciones a la vez, para no hacer una consulta por
   * fila al pintar el arbol completo de una pregunta.
   */
  async getResponsesByIntentIds(intentIds: string[]): Promise<BotResponse[]> {
    if (intentIds.length === 0) return [];
    const { data, error } = await supabase
      .from('bot_responses')
      .select('*, response_fact_dependencies(compiler_facts(material_id, page_number, fact_key, compiler_materials(original_filename)))')
      .in('intent_id', intentIds)
      .order('order_priority', { ascending: true });

    if (error) {
      console.error('Error fetching responses for intent ids:', error);
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
      .select('*, response_fact_dependencies(compiler_facts(material_id, page_number, fact_key, compiler_materials(original_filename)))')
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
  async createResponse(data: CreateBotResponse): Promise<BotResponse> {
    if (data.is_active) await this.assertActiveSlotAvailable(data.intent_id);
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
    if (data.is_active) {
      let intentId = data.intent_id;
      if (!intentId) {
        const { data: current, error: currentError } = await supabase
          .from('bot_responses')
          .select('intent_id')
          .eq('id', id)
          .single();
        if (currentError) throw currentError;
        intentId = current.intent_id;
      }
      if (!intentId) throw new Error('La respuesta no tiene una intención asociada');
      await this.assertActiveSlotAvailable(intentId, id);
    }
    const { error } = await supabase
      .from('bot_responses')
      .update({
        ...normalizeResponseWrite(data),
        edited_by_human: true,
        updated_at: new Date().toISOString(),
      })
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
