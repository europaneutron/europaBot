/**
 * Página de visualización de citas con shadcn/ui
 * Permite marcar citas como atendidas y filtrar
 */

import { supabaseServer } from '@/services/supabase/server-client';
import { AppointmentsClient } from './appointments-client';

// Desactivar cache de Next.js para esta página
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface AppointmentWithUser {
  id: string;
  visitor_name: string;
  requested_date: string;
  appointment_date: string;
  time_slot: string;
  time_slot_start: string;
  time_slot_end: string;
  status: string;
  agent_notified_at: string | null;
  created_at: string;
  user: {
    phone_number: string;
    name: string | null;
    lead_score: number;
  };
}

async function getAppointments(): Promise<AppointmentWithUser[]> {
  const { data, error } = await supabaseServer
    .from('appointments')
    .select(`
      id,
      visitor_name,
      requested_date,
      appointment_date,
      time_slot,
      time_slot_start,
      time_slot_end,
      status,
      agent_notified_at,
      created_at,
      user:users!appointments_user_id_fkey!inner (
        phone_number,
        name,
        lead_score,
        is_simulated
      )
    `)
    .eq('user.is_simulated', false)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching appointments:', error);
    return [];
  }

  return data as any;
}

export default async function AppointmentsPage() {
  const appointments = await getAppointments();

  return <AppointmentsClient initialAppointments={appointments} />;
}
