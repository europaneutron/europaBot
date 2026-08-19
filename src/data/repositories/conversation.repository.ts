/**
 * Conversation Repository - Acceso a datos de conversaciones
 */

import { supabaseServer } from '@/services/supabase/server-client';
import type { Conversation, IntentLog } from '@/data/models/conversation.model';
import type { IntentMatch } from '@/types/intent.types';
import {
  interpolateMessage,
  interpolateMessageValue,
  toMessageVariables,
  type MessageVariables,
} from '@/lib/interpolate-message';
import { catalogValueRepository } from '@/data/repositories/catalog-value.repository';

export class ConversationRepository {
  /**
   * Guardar mensaje entrante
   */
  async saveIncomingMessage(
    userId: string,
    messageId: string,
    messageText: string,
    detectedIntent?: IntentMatch,
    routing?: { scopeId?: string | null; referralAdId?: string }
  ): Promise<Conversation> {
    const { data, error } = await supabaseServer
      .from('conversations')
      .insert({
        user_id: userId,
        message_id: messageId,
        direction: 'inbound',
        message_text: messageText,
        message_type: 'text',
        detected_intent: detectedIntent?.intent_name,
        intent_confidence: detectedIntent?.confidence,
        was_fallback: false,
        scope_id: routing?.scopeId ?? detectedIntent?.scope_id ?? null,
        referral_ad_id: routing?.referralAdId ?? null
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * El último mensaje que el bot le envió a este usuario, o null si no hay.
   *
   * Lo usa el flujo de cita para no repetir una pregunta que acaba de hacer.
   */
  async getLastOutgoingMessage(userId: string): Promise<string | null> {
    const { data, error } = await supabaseServer
      .from('conversations')
      .select('message_text')
      .eq('user_id', userId)
      .eq('direction', 'outbound')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data?.message_text ?? null;
  }

  /**
   * Guardar mensaje saliente (respuesta del bot)
   */
  async saveOutgoingMessage(
    userId: string,
    messageText: string,
    wasFallback: boolean = false,
    fallbackLevel?: number,
    scopeId?: string | null
  ): Promise<Conversation> {
    const { data, error } = await supabaseServer
      .from('conversations')
      .insert({
        user_id: userId,
        direction: 'outbound',
        message_text: messageText,
        message_type: 'text',
        was_fallback: wasFallback,
        fallback_level: fallbackLevel,
        scope_id: scopeId ?? null
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
  async getBotResponse(
    intentIds: string | string[],
    responseKey: string = 'main',
    variables: MessageVariables = {},
    scopeId?: string | null
  ): Promise<string | null> {
    const resolutionIds = Array.isArray(intentIds) ? intentIds : [intentIds];
    const { data, error } = await supabaseServer
      .from('bot_responses')
      .select('intent_id, message_text, variables')
      .in('intent_id', resolutionIds)
      .eq('response_key', responseKey)
      .eq('is_active', true);

    if (error || !data) return null;

    const resolved = resolutionIds
      .map(intentId => data.find(row => row.intent_id === intentId))
      .find(Boolean);
    if (!resolved) return null;

    const catalogVariables = scopeId
      ? await catalogValueRepository.getResolvedVariables(scopeId)
      : {};
    const interpolation = interpolateMessage(resolved.message_text, {
      ...toMessageVariables(resolved.variables),
      ...catalogVariables,
      ...variables,
    });
    return interpolation.complete ? interpolation.value : null;
  }

  /**
   * Obtener múltiples respuestas para un intent (en orden de prioridad)
   * Soporta respuestas simples (string) y fragmentadas (JSON)
   *
   * `variables` es el contexto de la conversación: lo que solo se conoce al
   * responder. La columna `bot_responses.variables` aporta los valores fijos
   * que el administrador dejó escritos con la respuesta, y el contexto los
   * sobrescribe cuando trae algo para la misma clave.
   */
  async getBotResponses(
    intentIds: string | string[],
    variables: MessageVariables = {},
    scopeId?: string | null
  ): Promise<import('@/types/message-fragments.types').BotResponse[]> {
    const resolutionIds = Array.isArray(intentIds) ? intentIds : [intentIds];
    const { data, error } = await supabaseServer
      .from('bot_responses')
      .select('intent_id, message_text, media_url, response_type, order_priority, variables')
      .in('intent_id', resolutionIds)
      .eq('is_active', true)
      .order('order_priority', { ascending: true});

    if (error || !data) return [];

    const resolvedIntentId = resolutionIds.find(
      intentId => data.some(row => row.intent_id === intentId)
    );
    if (!resolvedIntentId) return [];

    const catalogVariables = scopeId
      ? await catalogValueRepository.getResolvedVariables(scopeId)
      : {};

    return data.filter(row => row.intent_id === resolvedIntentId).flatMap<
      import('@/types/message-fragments.types').BotResponse
    >(row => {
      const rowVariables = {
        ...toMessageVariables(row.variables),
        ...catalogVariables,
        ...variables,
      };

      // Si es fragmentado, message_text ya es un objeto JSONB
      if (row.response_type === 'fragmented') {
        const interpolation = interpolateMessageValue(
          row.message_text,
          rowVariables
        );
        return interpolation.complete
          ? [interpolation.value as import('@/types/message-fragments.types').FragmentedResponse]
          : [];
      }

      // Si tiene media_url, crear SimpleResponseWithMedia
      if (row.media_url && typeof row.media_url === 'string' && row.media_url.trim()) {
        const interpolation = typeof row.message_text === 'string'
          ? interpolateMessage(row.message_text, rowVariables)
          : null;
        if (interpolation && !interpolation.complete) return [];
        return [{
          text: interpolation?.value ?? null,
          media_url: row.media_url,
          media_type: this.detectMediaType(row.media_url)
        } as import('@/types/message-fragments.types').SimpleResponseWithMedia];
      }

      // Si es simple sin media, message_text es un string
      if (typeof row.message_text === 'string') {
        const interpolation = interpolateMessage(row.message_text, rowVariables);
        return interpolation.complete ? [interpolation.value] : [];
      }

      // Si PostgreSQL lo devolvió como string JSON, parsearlo
      return [String(row.message_text)];
    });
  }

  /**
   * Qué intención declara ofrecer la respuesta que `getBotResponses`
   * resolvería para estos mismos `intentIds`, con la misma resolución por
   * orden. `null` cuando la respuesta no termina en pregunta de sí/no —que
   * es el caso normal— o cuando no declaró ninguna.
   */
  async getResponseOffer(intentIds: string | string[]): Promise<string | null> {
    const resolutionIds = Array.isArray(intentIds) ? intentIds : [intentIds];
    const { data, error } = await supabaseServer
      .from('bot_responses')
      .select('intent_id, offers_intent_name, order_priority')
      .in('intent_id', resolutionIds)
      .eq('is_active', true)
      .order('order_priority', { ascending: true });

    if (error || !data) return null;

    const resolvedIntentId = resolutionIds.find(
      intentId => data.some(row => row.intent_id === intentId)
    );
    if (!resolvedIntentId) return null;

    const row = data.find(candidate => candidate.intent_id === resolvedIntentId);
    return row?.offers_intent_name || null;
  }

  /**
   * Los botones que declara la respuesta que `getBotResponses` resolvería
   * para estos mismos `intentIds`, con la misma resolución por orden.
   *
   * `null` cuando la respuesta no declara ninguno, que es el caso normal: ahí
   * los compone el sistema con las preguntas vivas del alcance. Cuando sí los
   * declara, mandan ellos: quien escribió la respuesta sabe mejor que una
   * regla cuál es el paso siguiente de esa conversación.
   */
  async getResponseButtons(
    intentIds: string | string[]
  ): Promise<Array<{ label: string; intentName: string; scopeId: string | null }> | null> {
    const resolutionIds = Array.isArray(intentIds) ? intentIds : [intentIds];
    const { data, error } = await supabaseServer
      .from('bot_responses')
      .select('intent_id, buttons, order_priority')
      .in('intent_id', resolutionIds)
      .eq('is_active', true)
      .order('order_priority', { ascending: true });

    if (error || !data) return null;

    const resolvedIntentId = resolutionIds.find(
      intentId => data.some(row => row.intent_id === intentId)
    );
    if (!resolvedIntentId) return null;

    const row = data.find(candidate => candidate.intent_id === resolvedIntentId);
    const buttons = row?.buttons;
    if (!Array.isArray(buttons) || buttons.length === 0) return null;

    return buttons
      .filter((button: any) => button?.label?.trim() && button?.intentName?.trim())
      .map((button: any) => ({
        label: String(button.label).trim(),
        intentName: String(button.intentName).trim(),
        scopeId: button.scopeId ? String(button.scopeId) : null,
      }));
  }

  /**
   * Detectar tipo de archivo por extensión
   */
  private detectMediaType(url: string): 'image' | 'document' | 'video' | undefined {
    const ext = url.split('.').pop()?.toLowerCase();
    
    if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext || '')) return 'image';
    if (['pdf', 'doc', 'docx'].includes(ext || '')) return 'document';
    if (['mp4', 'mov', 'avi'].includes(ext || '')) return 'video';
    
    return undefined;
  }
}

// Singleton
export const conversationRepository = new ConversationRepository();
