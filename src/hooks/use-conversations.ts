/**
 * Hook para gestionar conversaciones con filtros
 */

'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/services/supabase/client';

export interface Conversation {
  user_id: string;
  user_phone: string;
  user_name: string | null;
  lead_status: string;
  lead_score: number;
  message_count: number;
  last_message: string;
  last_message_time: string;
  last_intent: string | null;
  has_appointment: boolean;
  appointment_date: string | null;
  checkpoints: string[];
}

export interface ConversationFilters {
  startDate?: string;
  endDate?: string;
  leadStatus?: string;
  hasAppointment?: boolean;
  searchQuery?: string;
}

export function useConversations(filters?: ConversationFilters) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchConversations();
  }, [filters]);

  async function fetchConversations() {
    try {
      setLoading(true);
      setError(null);

      // Query base: obtener usuarios
      let query = supabase
        .from('users')
        .select('*')
        .order('updated_at', { ascending: false });

      // Aplicar filtros
      if (filters?.leadStatus) {
        query = query.eq('lead_status', filters.leadStatus);
      }

      if (filters?.searchQuery) {
        query = query.or(
          `phone_number.ilike.%${filters.searchQuery}%,name.ilike.%${filters.searchQuery}%`
        );
      }

      const { data: users, error: queryError } = await query;

      if (queryError) throw queryError;

      if (!users || users.length === 0) {
        setConversations([]);
        return;
      }

      // OPTIMIZACIÓN: Obtener todos los datos necesarios en 3 queries en paralelo
      const userIds = users.map((u: any) => u.id);
      const today = new Date().toISOString().split('T')[0];

      const [conversationsData, appointmentsData] = await Promise.all([
        // 1 query: Obtener últimos mensajes de TODOS los usuarios
        supabase
          .from('conversations')
          .select('user_id, message_text, created_at, detected_intent')
          .in('user_id', userIds)
          .order('created_at', { ascending: false }),
        
        // 1 query: Obtener próximas citas de TODOS los usuarios
        supabase
          .from('appointments')
          .select('user_id, appointment_date')
          .in('user_id', userIds)
          .eq('status', 'confirmed')
          .gte('appointment_date', today)
          .order('appointment_date', { ascending: true })
      ]);

      // Agrupar mensajes por user_id
      const messagesByUser = new Map();
      conversationsData.data?.forEach((msg: any) => {
        if (!messagesByUser.has(msg.user_id)) {
          messagesByUser.set(msg.user_id, []);
        }
        messagesByUser.get(msg.user_id).push(msg);
      });

      // Agrupar citas por user_id
      const appointmentsByUser = new Map();
      appointmentsData.data?.forEach((apt: any) => {
        if (!appointmentsByUser.has(apt.user_id)) {
          appointmentsByUser.set(apt.user_id, apt);
        }
      });

      // Procesar datos combinando todo
      const conversationsWithMessages = users.map((user: any) => {
        const userMessages = messagesByUser.get(user.id) || [];
        const lastMessage = userMessages[0] || null;
        const appointment = appointmentsByUser.get(user.id) || null;

        return {
          user,
          lastMessage: lastMessage ? {
            message_text: lastMessage.message_text,
            created_at: lastMessage.created_at,
            intent_matched: lastMessage.detected_intent
          } : null,
          messageCount: userMessages.length,
          hasAppointment: !!appointment,
          appointmentDate: appointment?.appointment_date || null
        };
      });

      // Procesar datos
      const processedConversations: Conversation[] = conversationsWithMessages.map((item) => {
        return {
          user_id: item.user.id,
          user_phone: item.user.phone_number,
          user_name: item.user.name,
          lead_status: item.user.lead_status,
          lead_score: item.user.lead_score,
          message_count: item.messageCount,
          last_message: item.lastMessage?.message_text || 'Sin mensajes',
          last_message_time: item.lastMessage?.created_at || item.user.created_at,
          last_intent: item.lastMessage?.intent_matched || null,
          has_appointment: item.hasAppointment,
          appointment_date: item.appointmentDate,
          checkpoints: [], // Los checkpoints están en user_progress, no en users
        };
      });

      // Filtrar por fecha si aplica
      let filtered = processedConversations;

      if (filters?.startDate) {
        filtered = filtered.filter(
          (conv) => new Date(conv.last_message_time) >= new Date(filters.startDate!)
        );
      }

      if (filters?.endDate) {
        filtered = filtered.filter(
          (conv) => new Date(conv.last_message_time) <= new Date(filters.endDate!)
        );
      }

      if (filters?.hasAppointment !== undefined) {
        filtered = filtered.filter(
          (conv) => conv.has_appointment === filters.hasAppointment
        );
      }

      setConversations(filtered);
    } catch (err) {
      console.error('Error fetching conversations:', err);
      setError('Error al cargar conversaciones');
    } finally {
      setLoading(false);
    }
  }

  return {
    conversations,
    loading,
    error,
    refetch: fetchConversations,
  };
}

/**
 * Hook para obtener detalle de una conversacion (thread completo)
 * Con paginacion inversa para eficiencia
 */
export interface Message {
  id: string;
  message_text: string;
  is_from_user: boolean;
  intent_matched: string | null;
  created_at: string;
}

export interface CheckpointConfig {
  intent_name: string;
  display_name: string;
  is_completed: boolean;
}

export interface ConversationDetail {
  user: {
    id: string;
    phone_number: string;
    name: string | null;
    lead_status: string;
    lead_score: number;
    created_at: string;
  };
  messages: Message[];
  appointments: any[];
  progress: any;
  checkpoints: CheckpointConfig[];
  totalMessages: number;
  hasMore: boolean;
}

const MESSAGES_PER_PAGE = 50;

export function useConversationDetail(userId: string) {
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userId) {
      fetchDetail();
    }
  }, [userId]);

  async function fetchDetail() {
    try {
      setLoading(true);
      setError(null);

      // Obtener usuario, citas, progreso y checkpoints en paralelo
      const [userResult, appointmentsResult, progressResult, checkpointsResult, countResult] = await Promise.all([
        supabase.from('users').select('*').eq('id', userId).single(),
        supabase.from('appointments').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        supabase.from('user_progress').select('*').eq('user_id', userId).single(),
        supabase.from('intent_configurations').select('intent_name, display_name').eq('is_checkpoint', true).eq('is_active', true).order('priority', { ascending: false }),
        supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('user_id', userId)
      ]);

      if (userResult.error) throw userResult.error;

      const user = userResult.data;
      const appointments = appointmentsResult.data || [];
      const progress = progressResult.data;
      const totalMessages = countResult.count || 0;

      // Obtener ultimos N mensajes (DESC para obtener los mas recientes, luego invertir)
      const { data: messagesData, error: messagesError } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(MESSAGES_PER_PAGE);

      if (messagesError) throw messagesError;

      // Invertir para mostrar en orden cronologico (antiguos arriba, recientes abajo)
      const messages = (messagesData || []).reverse().map(msg => ({
        id: msg.id,
        message_text: msg.message_text,
        is_from_user: msg.direction === 'inbound',
        intent_matched: msg.detected_intent,
        created_at: msg.created_at
      }));

      // Mapear checkpoints con su estado de completado
      const checkpoints: CheckpointConfig[] = (checkpointsResult.data || []).map((intent) => {
        const completedKey = `${intent.intent_name}_completed` as keyof typeof progress;
        return {
          intent_name: intent.intent_name,
          display_name: intent.display_name,
          is_completed: progress ? Boolean(progress[completedKey]) : false,
        };
      });

      setDetail({
        user,
        messages,
        appointments,
        progress: progress || null,
        checkpoints,
        totalMessages,
        hasMore: totalMessages > MESSAGES_PER_PAGE,
      });
    } catch (err) {
      console.error('Error fetching conversation detail:', err);
      setError('Error al cargar detalle de conversacion');
    } finally {
      setLoading(false);
    }
  }

  async function loadMoreMessages() {
    if (!detail || loadingMore || !detail.hasMore) return;

    try {
      setLoadingMore(true);

      // El mensaje mas antiguo que tenemos actualmente
      const oldestMessage = detail.messages[0];
      if (!oldestMessage) return;

      // Obtener mensajes anteriores a ese
      const { data: olderMessages, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', detail.user.id)
        .lt('created_at', oldestMessage.created_at)
        .order('created_at', { ascending: false })
        .limit(MESSAGES_PER_PAGE);

      if (error) throw error;

      if (olderMessages && olderMessages.length > 0) {
        // Invertir y mapear
        const mappedMessages = olderMessages.reverse().map(msg => ({
          id: msg.id,
          message_text: msg.message_text,
          is_from_user: msg.direction === 'inbound',
          intent_matched: msg.detected_intent,
          created_at: msg.created_at
        }));

        setDetail(prev => {
          if (!prev) return prev;
          const newMessages = [...mappedMessages, ...prev.messages];
          return {
            ...prev,
            messages: newMessages,
            hasMore: newMessages.length < prev.totalMessages,
          };
        });
      } else {
        setDetail(prev => prev ? { ...prev, hasMore: false } : prev);
      }
    } catch (err) {
      console.error('Error loading more messages:', err);
    } finally {
      setLoadingMore(false);
    }
  }

  return {
    detail,
    loading,
    loadingMore,
    error,
    refetch: fetchDetail,
    loadMoreMessages,
  };
}
