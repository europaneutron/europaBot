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

      // Query base: obtener usuarios con sus últimos mensajes
      let query = supabase
        .from('users')
        .select(`
          id,
          phone_number,
          name,
          lead_status,
          lead_score,
          conversation_messages (
            message_text,
            created_at,
            intent_matched
          ),
          appointments (
            id,
            status
          )
        `)
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

      // Procesar datos
      const processedConversations: Conversation[] = users?.map((user: any) => {
        const messages = user.conversation_messages || [];
        const lastMessage = messages[messages.length - 1];
        const hasAppointment = user.appointments?.some(
          (apt: any) => apt.status === 'confirmed' || apt.status === 'pending'
        ) || false;

        return {
          user_id: user.id,
          user_phone: user.phone_number,
          user_name: user.name,
          lead_status: user.lead_status,
          lead_score: user.lead_score,
          message_count: messages.length,
          last_message: lastMessage?.message_text || 'Sin mensajes',
          last_message_time: lastMessage?.created_at || user.created_at,
          last_intent: lastMessage?.intent_matched || null,
          has_appointment: hasAppointment,
        };
      }) || [];

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
 * Hook para obtener detalle de una conversación (thread completo)
 */
export interface Message {
  id: string;
  message_text: string;
  is_from_user: boolean;
  intent_matched: string | null;
  created_at: string;
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
}

export function useConversationDetail(userId: string) {
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
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

      // Obtener usuario
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (userError) throw userError;

      // Obtener mensajes
      const { data: messages, error: messagesError } = await supabase
        .from('conversation_messages')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (messagesError) throw messagesError;

      // Obtener citas
      const { data: appointments, error: appointmentsError } = await supabase
        .from('appointments')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (appointmentsError) throw appointmentsError;

      // Obtener progreso
      const { data: progress, error: progressError } = await supabase
        .from('user_progress')
        .select('*')
        .eq('user_id', userId)
        .single();

      // El error es OK si no existe progreso aún

      setDetail({
        user,
        messages: messages || [],
        appointments: appointments || [],
        progress: progress || null,
      });
    } catch (err) {
      console.error('Error fetching conversation detail:', err);
      setError('Error al cargar detalle de conversación');
    } finally {
      setLoading(false);
    }
  }

  return {
    detail,
    loading,
    error,
    refetch: fetchDetail,
  };
}
