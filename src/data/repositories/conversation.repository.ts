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
import { scopeRepository } from '@/data/repositories/scope.repository';

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
  /**
   * Las mismas filas, ordenadas por el alcance de la conversacion: primero la
   * suya, luego las de sus ancestros. Las que no pertenecen a la cadena van al
   * final, en el orden en que llegaron.
   *
   * Sin alcance no hay nada que reordenar y se devuelven tal cual.
   */
  private async orderByScopeResolution(
    intentIds: string[],
    scopeId?: string | null
  ): Promise<string[]> {
    if (!scopeId || intentIds.length < 2) return intentIds;

    const { data, error } = await supabaseServer
      .from('intent_configurations')
      .select('id, scope_id')
      .in('id', intentIds);
    // Un fallo aqui no debe dejar al lead sin respuesta: se sigue con el orden
    // que llego, que es lo que se hacia antes de esta correccion.
    if (error || !data) return intentIds;

    const scopeOf = new Map(data.map(row => [row.id as string, row.scope_id as string | null]));
    const order = await scopeRepository.getResolutionOrder(scopeId);
    const rank = new Map(order.map((id, index) => [id, index]));

    return [...intentIds].sort((left, right) => {
      const leftRank = rank.get(scopeOf.get(left) ?? null) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = rank.get(scopeOf.get(right) ?? null) ?? Number.MAX_SAFE_INTEGER;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return intentIds.indexOf(left) - intentIds.indexOf(right);
    });
  }

  async getBotResponses(
    intentIds: string | string[],
    variables: MessageVariables = {},
    scopeId?: string | null
  ): Promise<import('@/types/message-fragments.types').BotResponse[]> {
    const requestedIds = Array.isArray(intentIds) ? intentIds : [intentIds];

    // El orden manda, porque de esta lista sale una sola fila: la primera que
    // tenga contenido. Y el orden que llega no siempre es el bueno.
    //
    // Sin foco, la deteccion busca en todos los alcances a la vez y devuelve
    // las filas en el orden en que las encontro, que puede empezar por un
    // fraccionamiento. Con la conversacion en la inmobiliaria, eso hacia que
    // contestara la fila de Europa: "info" devolvia el brochure de Europa --y
    // como ese texto usa {precio}, que en la inmobiliaria no existe, se caia
    // entero y el lead recibia "no entiendo tu pregunta".
    //
    // Aqui se reordena por el alcance de la conversacion: primero el suyo,
    // luego sus ancestros. Es el mismo orden que usa `resolveRows`.
    const resolutionIds = await this.orderByScopeResolution(requestedIds, scopeId);

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

    // Los datos del alcance donde esta la conversacion, con su herencia, mas
    // los de cualquier alcance nombrados con su procedencia --{europa.precio}--
    // para poder componer un mensaje con datos de donde sea. Los dos espacios
    // de nombres no chocan: uno lleva punto y el otro no.
    const [catalogVariables, qualifiedVariables] = await Promise.all([
      scopeId ? catalogValueRepository.getResolvedVariables(scopeId) : Promise.resolve({}),
      catalogValueRepository.getQualifiedVariables(),
    ]);

    return data.filter(row => row.intent_id === resolvedIntentId).flatMap<
      import('@/types/message-fragments.types').BotResponse
    >(row => {
      const rowVariables = {
        ...toMessageVariables(row.variables),
        ...qualifiedVariables,
        ...catalogVariables,
        ...variables,
      };

      // Si es fragmentado, message_text ya es un objeto JSONB
      if (row.response_type === 'fragmented') {
        const interpolation = interpolateMessageValue(
          row.message_text,
          rowVariables
        );
        if (!interpolation.complete) {
          // Se descarta para no mandarle "{precio}" a nadie, pero antes no
          // dejaba rastro: el turno se quedaba sin respuesta, caia al mensaje
          // de "no entiendo tu pregunta", y quien configuraba no tenia forma
          // de saber que su respuesta existia y se habia tirado por una
          // variable que ahi no vale.
          console.error(
            `La respuesta ${row.intent_id} usa variables que no existen en este alcance:`
            + ` ${interpolation.missingKeys.join(', ')}. No se manda.`
          );
          return [];
        }
        return [interpolation.value as import('@/types/message-fragments.types').FragmentedResponse];
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
