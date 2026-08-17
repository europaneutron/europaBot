/**
 * Hooks para obtener métricas y analytics del bot
 * Implementados con SWR para cache y revalidación automática
 */

'use client';

import useSWR from 'swr';
import { supabase } from '@/services/supabase/client';

// Configuración por defecto para SWR
const swrConfig = {
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  dedupingInterval: 5000, // No refetch si ya se hizo en últimos 5s
};

// Interfaces
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

// Fetchers
async function fetchMetrics(): Promise<AnalyticsMetrics> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [usersResult, conversationsResult, appointmentsResult, hotLeadsResult] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }).eq('is_simulated', false),
    supabase.from('conversations').select('users!inner(is_simulated)', { count: 'exact', head: true }).eq('users.is_simulated', false).gte('created_at', today.toISOString()),
    supabase.from('appointments').select('users!inner(is_simulated)', { count: 'exact', head: true }).eq('users.is_simulated', false).in('status', ['pending', 'confirmed']),
    supabase.from('users').select('*', { count: 'exact', head: true }).eq('is_simulated', false).eq('lead_status', 'hot'),
  ]);

  return {
    totalUsers: usersResult.count || 0,
    conversationsToday: conversationsResult.count || 0,
    pendingAppointments: appointmentsResult.count || 0,
    hotLeads: hotLeadsResult.count || 0,
  };
}

async function fetchConversationsByDay(days: number): Promise<ConversationByDay[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const { data: messages, error } = await supabase
    .from('conversations')
    .select('created_at, users!inner(is_simulated)')
    .eq('users.is_simulated', false)
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: true });

  if (error) throw error;

  const grouped: Record<string, number> = {};
  messages?.forEach((msg) => {
    const date = new Date(msg.created_at).toLocaleDateString('es-ES');
    grouped[date] = (grouped[date] || 0) + 1;
  });

  return Object.entries(grouped).map(([date, count]) => ({ date, count }));
}

async function fetchIntentDistribution(): Promise<IntentDistribution[]> {
  const { data: messages, error } = await supabase
    .from('conversations')
    .select('detected_intent, users!inner(is_simulated)')
    .eq('users.is_simulated', false)
    .eq('direction', 'inbound')
    .not('detected_intent', 'is', null);

  if (error) throw error;

  const counts: Record<string, number> = {};
  messages?.forEach((msg) => {
    const intent = msg.detected_intent || 'unknown';
    counts[intent] = (counts[intent] || 0) + 1;
  });

  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

  return Object.entries(counts)
    .map(([intent_name, count]) => ({
      intent_name,
      count,
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}

async function fetchRecentConversations(limit: number): Promise<RecentConversation[]> {
  const { data: messages, error } = await supabase
    .from('conversations')
    .select(`
      user_id,
      message_text,
      created_at,
      users!inner (
        id,
        phone_number,
        name,
        lead_status,
        lead_score,
        is_simulated
      )
    `)
    .eq('users.is_simulated', false)
    .order('created_at', { ascending: false })
    .limit(limit * 2);

  if (error) throw error;

  const userLastMessages = new Map<string, any>();
  messages?.forEach((msg: any) => {
    if (!userLastMessages.has(msg.user_id)) {
      userLastMessages.set(msg.user_id, msg);
    }
  });

  return Array.from(userLastMessages.values())
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
}

async function fetchUpcomingAppointments(limit: number): Promise<UpcomingAppointment[]> {
  const today = new Date().toISOString().split('T')[0];

  const { data: appointments, error } = await supabase
    .from('appointments')
    .select(`
      id,
      appointment_date,
      time_slot,
      status,
      user_id,
      users!appointments_user_id_fkey!inner (
        phone_number,
        name,
        is_simulated
      )
    `)
    .eq('users.is_simulated', false)
    .in('status', ['pending', 'confirmed'])
    .gte('appointment_date', today)
    .order('appointment_date', { ascending: true })
    .order('time_slot', { ascending: true })
    .limit(limit);

  if (error) throw error;

  return (
    appointments?.map((apt: any) => ({
      id: apt.id,
      user_phone: apt.users?.phone_number || 'N/A',
      user_name: apt.users?.name || null,
      appointment_date: apt.appointment_date,
      appointment_time: apt.time_slot,
      status: apt.status,
    })) || []
  );
}

// Hooks con SWR

/**
 * Hook para métricas principales del dashboard
 */
export function useAnalytics() {
  const { data, error, isLoading, mutate } = useSWR<AnalyticsMetrics>(
    'analytics-metrics',
    fetchMetrics,
    {
      ...swrConfig,
      fallbackData: {
        totalUsers: 0,
        conversationsToday: 0,
        pendingAppointments: 0,
        hotLeads: 0,
      },
    }
  );

  return {
    metrics: data!,
    loading: isLoading,
    error: error?.message || null,
    refetch: mutate,
  };
}

/**
 * Hook para conversaciones por día
 */
export function useConversationsByDay(days: number = 7) {
  const { data, isLoading, mutate } = useSWR<ConversationByDay[]>(
    ['conversations-by-day', days],
    () => fetchConversationsByDay(days),
    {
      ...swrConfig,
      fallbackData: [],
    }
  );

  return {
    data: data!,
    loading: isLoading,
    refetch: mutate,
  };
}

/**
 * Hook para distribución de intenciones
 */
export function useIntentDistribution() {
  const { data, isLoading, mutate } = useSWR<IntentDistribution[]>(
    'intent-distribution',
    fetchIntentDistribution,
    {
      ...swrConfig,
      fallbackData: [],
    }
  );

  return {
    data: data!,
    loading: isLoading,
    refetch: mutate,
  };
}

/**
 * Hook para conversaciones recientes
 */
export function useRecentConversations(limit: number = 10) {
  const { data, isLoading, mutate } = useSWR<RecentConversation[]>(
    ['recent-conversations', limit],
    () => fetchRecentConversations(limit),
    {
      ...swrConfig,
      fallbackData: [],
    }
  );

  return {
    data: data!,
    loading: isLoading,
    refetch: mutate,
  };
}

/**
 * Hook para próximas citas
 */
export function useUpcomingAppointments(limit: number = 5) {
  const { data, isLoading, mutate } = useSWR<UpcomingAppointment[]>(
    ['upcoming-appointments', limit],
    () => fetchUpcomingAppointments(limit),
    {
      ...swrConfig,
      fallbackData: [],
    }
  );

  return {
    data: data!,
    loading: isLoading,
    refetch: mutate,
  };
}
