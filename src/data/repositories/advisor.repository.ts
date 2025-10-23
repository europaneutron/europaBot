/**
 * Repositorio para solicitudes de asesor
 * Maneja derivaciones de usuarios que necesitan atención humana
 */

import { supabaseServer } from '@/services/supabase/server-client';
import type { AdvisorRequest, AdvisorRequestData } from '@/types/advisor.types';

export class AdvisorRepository {
  /**
   * Crear nueva solicitud de asesor
   */
  async create(data: AdvisorRequestData): Promise<AdvisorRequest> {
    const { data: request, error } = await supabaseServer
      .from('advisor_requests')
      .insert({
        user_id: data.user_id,
        request_reason: data.request_reason,
        last_user_message: data.last_user_message,
        fallback_count: data.fallback_count,
        lead_score: data.lead_score,
        checkpoints_completed: data.checkpoints_completed,
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating advisor request:', error);
      throw error;
    }

    return request;
  }

  /**
   * Obtener solicitudes pendientes
   */
  async getPending(): Promise<any[]> {
    const { data, error } = await supabaseServer
      .from('advisor_requests')
      .select(`
        *,
        user:users (
          phone_number,
          name,
          lead_score,
          lead_status
        )
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false});

    if (error) {
      console.error('Error fetching pending requests:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Marcar como contactado
   */
  async markContacted(requestId: string, assignedTo: string): Promise<void> {
    await supabaseServer
      .from('advisor_requests')
      .update({
        status: 'contacted',
        assigned_to: assignedTo,
        contacted_at: new Date().toISOString()
      })
      .eq('id', requestId);
  }

  /**
   * Marcar como resuelto
   */
  async markResolved(requestId: string, notes?: string): Promise<void> {
    await supabaseServer
      .from('advisor_requests')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        notes
      })
      .eq('id', requestId);
  }
}

// Singleton
export const advisorRepository = new AdvisorRepository();
