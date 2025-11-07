/**
 * Repository para gestión de follow-ups programados
 * Maneja la tabla scheduled_followups
 */

import { supabaseServer } from '@/services/supabase/server-client';

export interface ScheduledFollowup {
  id: string;
  user_id: string;
  advisor_request_id: string | null;
  followup_type: string;
  delay_hours: number;
  scheduled_for: string;
  message_template: string | null;
  message_variables: Record<string, string> | null;
  status: 'pending' | 'sent' | 'cancelled';
  executed_at: string | null;
  user_responded: boolean;
  created_at: string;
}

export interface CreateFollowupData {
  user_id: string;
  advisor_request_id?: string;
  followup_type: string;
  delay_hours: number;
  scheduled_for: Date;
  message_template?: string;
  message_variables?: Record<string, string>;
}

export class FollowupRepository {
  /**
   * Crear un follow-up programado
   */
  async createScheduledFollowup(data: CreateFollowupData): Promise<ScheduledFollowup> {
    const { data: followup, error } = await supabaseServer
      .from('scheduled_followups')
      .insert({
        user_id: data.user_id,
        advisor_request_id: data.advisor_request_id || null,
        followup_type: data.followup_type,
        delay_hours: data.delay_hours,
        scheduled_for: data.scheduled_for.toISOString(),
        message_template: data.message_template || null,
        message_variables: data.message_variables || null,
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      console.error('[FollowupRepository] Error creating followup:', error);
      throw error;
    }

    return followup;
  }

  /**
   * Obtener follow-ups pendientes que ya es hora de enviar
   */
  async getPendingFollowups(): Promise<ScheduledFollowup[]> {
    const now = new Date().toISOString();

    const { data, error } = await supabaseServer
      .from('scheduled_followups')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', now)
      .order('scheduled_for', { ascending: true });

    if (error) {
      console.error('[FollowupRepository] Error fetching pending followups:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Marcar follow-up como enviado
   */
  async markAsSent(followupId: string): Promise<void> {
    const { error } = await supabaseServer
      .from('scheduled_followups')
      .update({
        status: 'sent',
        executed_at: new Date().toISOString()
      })
      .eq('id', followupId);

    if (error) {
      console.error(`[FollowupRepository] Error marking followup ${followupId} as sent:`, error);
      throw error;
    }
  }

  /**
   * Verificar si ya existe un follow-up para una solicitud de asesor específica
   */
  async hasFollowupForRequest(advisorRequestId: string): Promise<boolean> {
    const { data, error } = await supabaseServer
      .from('scheduled_followups')
      .select('id')
      .eq('advisor_request_id', advisorRequestId)
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('[FollowupRepository] Error checking existing followup:', error);
      return false;
    }

    return !!data;
  }

  /**
   * Cancelar follow-ups pendientes de un usuario
   * Útil si el usuario agenda cita o responde
   */
  async cancelPendingForUser(userId: string): Promise<void> {
    const { error } = await supabaseServer
      .from('scheduled_followups')
      .update({ status: 'cancelled' })
      .eq('user_id', userId)
      .eq('status', 'pending');

    if (error) {
      console.error(`[FollowupRepository] Error cancelling followups for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Obtener follow-ups por usuario (para dashboard)
   */
  async getByUserId(userId: string): Promise<ScheduledFollowup[]> {
    const { data, error } = await supabaseServer
      .from('scheduled_followups')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(`[FollowupRepository] Error fetching followups for user ${userId}:`, error);
      return [];
    }

    return data || [];
  }

  /**
   * Marcar que el usuario respondió después del follow-up
   * Útil para métricas de efectividad
   */
  async markUserResponded(followupId: string): Promise<void> {
    const { error } = await supabaseServer
      .from('scheduled_followups')
      .update({ user_responded: true })
      .eq('id', followupId);

    if (error) {
      console.error(`[FollowupRepository] Error marking user responded for ${followupId}:`, error);
    }
  }
}

export const followupRepository = new FollowupRepository();
