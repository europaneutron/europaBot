/**
 * Hook para obtener métricas y analytics del bot
 */

'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/services/supabase/client';

interface AnalyticsMetrics {
  totalUsers: number;
  conversationsToday: number;
  pendingAppointments: number;
  hotLeads: number;
}

interface ConversationByDay {
  date: string;
  count: number;
}

interface IntentDistribution {
  intent_name: string;
  count: number;
  percentage: number;
}

interface RecentConversation {
  id: string;
  user_phone: string;
  user_name: string | null;
  last_message: string;
  last_message_time: string;
  lead_status: string;
  lead_score: number;
}

interface UpcomingAppointment {
  id: string;
  user_phone: string;
  user_name: string | null;
  appointment_date: string;
  appointment_time: string;
  status: string;
}

export function useAnalytics() {
  const [metrics, setMetrics] = useState<AnalyticsMetrics>({
    totalUsers: 0,
    conversationsToday: 0,
    pendingAppointments: 0,
    hotLeads: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMetrics();
  }, []);

  async function fetchMetrics() {
    try {
      setLoading(true);
      setError(null);

      // Total de usuarios
      const { count: totalUsers } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true });

      // Conversaciones de hoy
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count: conversationsToday } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today.toISOString());

      // Citas pendientes (status = 'pending' o 'confirmed')
      const { count: pendingAppointments } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .in('status', ['pending', 'confirmed']);

      // Leads HOT (score > 70)
      const { count: hotLeads } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('lead_status', 'hot');

      setMetrics({
        totalUsers: totalUsers || 0,
        conversationsToday: conversationsToday || 0,
        pendingAppointments: pendingAppointments || 0,
        hotLeads: hotLeads || 0,
      });
    } catch (err) {
      console.error('Error fetching metrics:', err);
      setError('Error al cargar métricas');
    } finally {
      setLoading(false);
    }
  }

  return { metrics, loading, error, refetch: fetchMetrics };
}

/**
 * Hook para obtener conversaciones por día (últimos N días)
 */
export function useConversationsByDay(days: number = 7) {
  const [data, setData] = useState<ConversationByDay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConversationsByDay();
  }, [days]);

  async function fetchConversationsByDay() {
    try {
      setLoading(true);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      const { data: messages, error } = await supabase
        .from('conversations')
        .select('created_at')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Agrupar por día
      const grouped: Record<string, number> = {};
      messages?.forEach((msg) => {
        const date = new Date(msg.created_at).toLocaleDateString('es-ES');
        grouped[date] = (grouped[date] || 0) + 1;
      });

      const result: ConversationByDay[] = Object.entries(grouped).map(
        ([date, count]) => ({ date, count })
      );

      setData(result);
    } catch (err) {
      console.error('Error fetching conversations by day:', err);
    } finally {
      setLoading(false);
    }
  }

  return { data, loading };
}

/**
 * Hook para obtener distribución de intenciones
 */
export function useIntentDistribution() {
  const [data, setData] = useState<IntentDistribution[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchIntentDistribution();
  }, []);

  async function fetchIntentDistribution() {
    try {
      setLoading(true);

      const { data: messages, error } = await supabase
        .from('conversations')
        .select('detected_intent')
        .eq('direction', 'inbound')
        .not('detected_intent', 'is', null);

      if (error) throw error;

      // Contar por intención
      const counts: Record<string, number> = {};
      messages?.forEach((msg) => {
        const intent = msg.detected_intent || 'unknown';
        counts[intent] = (counts[intent] || 0) + 1;
      });

      const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

      const result: IntentDistribution[] = Object.entries(counts)
        .map(([intent_name, count]) => ({
          intent_name,
          count,
          percentage: Math.round((count / total) * 100),
        }))
        .sort((a, b) => b.count - a.count);

      setData(result);
    } catch (err) {
      console.error('Error fetching intent distribution:', err);
    } finally {
      setLoading(false);
    }
  }

  return { data, loading };
}

/**
 * Hook para obtener últimas conversaciones
 */
export function useRecentConversations(limit: number = 10) {
  const [data, setData] = useState<RecentConversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecentConversations();
  }, [limit]);

  async function fetchRecentConversations() {
    try {
      setLoading(true);

      // Obtener últimos mensajes por usuario
      const { data: messages, error } = await supabase
        .from('conversations')
        .select(`
          user_id,
          message_text,
          created_at,
          users (
            id,
            phone_number,
            name,
            lead_status,
            lead_score
          )
        `)
        .order('created_at', { ascending: false })
        .limit(limit * 2); // Traer más para filtrar duplicados

      if (error) throw error;

      // Filtrar para tener solo el último mensaje por usuario
      const userLastMessages = new Map<string, any>();
      messages?.forEach((msg: any) => {
        if (!userLastMessages.has(msg.user_id)) {
          userLastMessages.set(msg.user_id, msg);
        }
      });

      const result: RecentConversation[] = Array.from(userLastMessages.values())
        .slice(0, limit)
        .map((msg: any) => ({
          id: msg.user_id,
          user_phone: msg.users?.phone_number || 'N/A',
          user_name: msg.users?.name || null,
          last_message: msg.message_text.substring(0, 100),
          last_message_time: msg.created_at,
          lead_status: msg.users?.lead_status || 'cold',
          lead_score: msg.users?.lead_score || 0,
        }));

      setData(result);
    } catch (err) {
      console.error('Error fetching recent conversations:', err);
    } finally {
      setLoading(false);
    }
  }

  return { data, loading };
}

/**
 * Hook para obtener próximas citas
 */
export function useUpcomingAppointments(limit: number = 5) {
  const [data, setData] = useState<UpcomingAppointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUpcomingAppointments();
  }, [limit]);

  async function fetchUpcomingAppointments() {
    try {
      setLoading(true);

      const { data: appointments, error } = await supabase
        .from('appointments')
        .select(`
          id,
          appointment_date,
          time_slot,
          status,
          user_id,
          users!appointments_user_id_fkey (
            phone_number,
            name
          )
        `)
        .in('status', ['pending', 'confirmed'])
        .gte('appointment_date', new Date().toISOString().split('T')[0])
        .order('appointment_date', { ascending: true })
        .order('time_slot', { ascending: true })
        .limit(limit);

      if (error) throw error;

      const result: UpcomingAppointment[] =
        appointments?.map((apt: any) => ({
          id: apt.id,
          user_phone: apt.users?.phone_number || 'N/A',
          user_name: apt.users?.name || null,
          appointment_date: apt.appointment_date,
          appointment_time: apt.time_slot,
          status: apt.status,
        })) || [];

      setData(result);
    } catch (err) {
      console.error('Error fetching upcoming appointments:', err);
    } finally {
      setLoading(false);
    }
  }

  return { data, loading };
}
