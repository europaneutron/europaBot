/**
 * Conversation Repository - Acceso a datos de conversaciones
 */

import { supabaseServer } from '@/services/supabase/server-client';
import type { Conversation, IntentLog } from '@/data/models/conversation.model';
import type { IntentMatch } from '@/types/intent.types';

export class ConversationRepository {
  /**
   * Guardar mensaje entrante
   */
  async saveIncomingMessage(
    userId: string,
    messageId: string,
    messageText: string,
    detectedIntent?: IntentMatch
  ): Promise<Conversation> {
    const { data, error } = await supabaseServer
      .from('conversations')
      .insert({
        user_id: userId,
        message_id: messageId,
        direction: 'incoming',
        message_text: messageText,
        message_type: 'text',
        detected_intent: detectedIntent?.intent_name,
        intent_confidence: detectedIntent?.confidence,
        was_fallback: false
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Guardar mensaje saliente (respuesta del bot)
   */
  async saveOutgoingMessage(
    userId: string,
    messageText: string,
    wasFallback: boolean = false,
    fallbackLevel?: number
  ): Promise<Conversation> {
    const { data, error } = await supabaseServer
      .from('conversations')
      .insert({
        user_id: userId,
        direction: 'outgoing',
        message_text: messageText,
        message_type: 'text',
        was_fallback: wasFallback,
        fallback_level: fallbackLevel
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Guardar log detallado de intención detectada
   */
  async saveIntentLog(
    userId: string,
    conversationId: string,
    intentMatch: IntentMatch,
    originalMessage: string,
    normalizedMessage: string
  ): Promise<void> {
    await supabaseServer
      .from('intents_log')
      .insert({
        user_id: userId,
        conversation_id: conversationId,
        intent_name: intentMatch.intent_name,
        confidence_score: intentMatch.confidence,
        matched_keywords: intentMatch.matched_keywords,
        fuzzy_matches: intentMatch.fuzzy_matches,
        original_message: originalMessage,
        normalized_message: normalizedMessage
      });
  }

  /**
   * Obtener últimas N conversaciones de un usuario
   */
  async getRecentConversations(userId: string, limit: number = 10): Promise<Conversation[]> {
    const { data, error } = await supabaseServer
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .order('sent_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  /**
   * Obtener historial completo de conversación
   */
  async getConversationHistory(userId: string): Promise<Conversation[]> {
    const { data, error } = await supabaseServer
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .order('sent_at', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  /**
   * Obtener estadísticas de intenciones detectadas
   */
  async getIntentStats(userId: string): Promise<{ intent: string; count: number }[]> {
    const { data, error } = await supabaseServer
      .from('intents_log')
      .select('intent_name')
      .eq('user_id', userId);

    if (error) return [];

    // Contar ocurrencias
    const counts: Record<string, number> = {};
    data.forEach(row => {
      counts[row.intent_name] = (counts[row.intent_name] || 0) + 1;
    });

    return Object.entries(counts).map(([intent, count]) => ({ intent, count }));
  }

  /**
   * Obtener respuesta configurada para un intent
   */
  async getBotResponse(intentName: string, responseKey: string = 'main'): Promise<string | null> {
    const { data, error } = await supabaseServer
      .from('bot_responses')
      .select('message_text, variables')
      .eq('intent_name', intentName)
      .eq('response_key', responseKey)
      .eq('is_active', true)
      .single();

    if (error || !data) return null;

    // TODO: Reemplazar variables dinámicas si existen
    return data.message_text;
  }

  /**
   * Obtener múltiples respuestas para un intent (en orden de prioridad)
   * Soporta respuestas simples (string) y fragmentadas (JSON)
   */
  async getBotResponses(intentName: string): Promise<import('@/types/message-fragments.types').BotResponse[]> {
    const { data, error } = await supabaseServer
      .from('bot_responses')
      .select('message_text, response_type, order_priority')
      .eq('intent_name', intentName)
      .eq('is_active', true)
      .order('order_priority', { ascending: true});

    if (error || !data) return [];

    return data.map(row => {
      // Si es fragmentado, message_text ya es un objeto JSONB
      if (row.response_type === 'fragmented') {
        return row.message_text as import('@/types/message-fragments.types').FragmentedResponse;
      }
      
      // Si es simple, message_text es un string (JSONB lo mantiene como string)
      // PostgreSQL convierte strings a JSONB como "string con comillas", hay que extraer
      if (typeof row.message_text === 'string') {
        return row.message_text;
      }
      
      // Si PostgreSQL lo devolvió como string JSON, parsearlo
      return String(row.message_text);
    });
  }
}

// Singleton
export const conversationRepository = new ConversationRepository();
