/**
 * Lead Scorer - Sistema de puntuación automatizada de leads
 * 
 * Responsabilidades:
 * - Calcular score basado en actividad del usuario
 * - Determinar temperatura del lead (cold/warm/hot)
 * - Actualizar automáticamente en base de datos
 * 
 * Reglas de negocio (configurables):
 * - Puntos por checkpoint completado (default: 15)
 * - Puntos por cita agendada (default: 20)
 * - Puntos por responder auto-offer (default: 10)
 * 
 * Clasificación:
 * - COLD: 0-39 puntos
 * - WARM: 40-69 puntos
 * - HOT: 70+ puntos
 */

import { userRepository } from '@/data/repositories/user.repository';
import { configRepository } from '@/data/repositories/config.repository';
import { supabaseServer } from '@/services/supabase/server-client';

export type LeadStatus = 'cold' | 'warm' | 'hot';

export interface LeadScoreBreakdown {
  checkpointsCompleted: number;
  checkpointPoints: number;
  hasAppointment: boolean;
  appointmentPoints: number;
  respondedToAutoOffer: boolean;
  autoOfferPoints: number;
  totalScore: number;
  status: LeadStatus;
}

export class LeadScorer {
  /**
   * Calcular score completo de un usuario
   * 
   * @param userId - ID del usuario
   * @returns Score total calculado
   */
  async calculateScore(userId: string): Promise<number> {
    const breakdown = await this.getScoreBreakdown(userId);
    return breakdown.totalScore;
  }

  /**
   * Obtener desglose completo del score
   * 
   * @param userId - ID del usuario
   * @returns Desglose detallado del score
   */
  async getScoreBreakdown(userId: string): Promise<LeadScoreBreakdown> {
    // Obtener configuración de puntos
    const checkpointPoints = await configRepository.getInt('checkpoint_points', 15);
    const appointmentPoints = await configRepository.getInt('appointment_points', 20);
    const autoOfferPoints = await configRepository.getInt('auto_offer_response_points', 10);

    // Obtener checkpoints completados
    const checkpointsCompleted = await userRepository.countCompletedCheckpoints(userId);

    // Verificar si tiene cita agendada
    const hasAppointment = await this.hasActiveAppointment(userId);

    // Verificar si respondió a auto-offer
    const respondedToAutoOffer = await this.hasRespondedToAutoOffer(userId);

    // Calcular puntos
    const checkpointScore = checkpointsCompleted * checkpointPoints;
    const appointmentScore = hasAppointment ? appointmentPoints : 0;
    const autoOfferScore = respondedToAutoOffer ? autoOfferPoints : 0;

    const totalScore = checkpointScore + appointmentScore + autoOfferScore;

    // Determinar status
    const status = await this.determineStatus(totalScore);

    return {
      checkpointsCompleted,
      checkpointPoints: checkpointScore,
      hasAppointment,
      appointmentPoints: appointmentScore,
      respondedToAutoOffer,
      autoOfferPoints: autoOfferScore,
      totalScore,
      status
    };
  }

  /**
   * Determinar status del lead basado en score
   * 
   * @param score - Score total del lead
   * @returns Status del lead
   */
  async determineStatus(score: number): Promise<LeadStatus> {
    const coldMax = await configRepository.getInt('lead_score_cold_max', 39);
    const warmMax = await configRepository.getInt('lead_score_warm_max', 69);

    if (score <= coldMax) {
      return 'cold';
    } else if (score <= warmMax) {
      return 'warm';
    } else {
      return 'hot';
    }
  }

  /**
   * Recalcular y actualizar score en BD
   * 
   * @param userId - ID del usuario
   * @returns Score actualizado
   */
  async recalculateAndUpdate(userId: string): Promise<number> {
    const breakdown = await this.getScoreBreakdown(userId);

    // Actualizar en base de datos
    await this.updateUserScore(userId, breakdown.totalScore, breakdown.status);

    return breakdown.totalScore;
  }

  /**
   * Actualizar score y status en BD
   * 
   * @private
   */
  private async updateUserScore(
    userId: string,
    score: number,
    status: LeadStatus
  ): Promise<void> {
    const { error } = await supabaseServer
      .from('users')
      .update({
        lead_score: score,
        lead_status: status,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) {
      console.error(`Error updating lead score for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Verificar si el usuario tiene cita agendada activa
   * 
   * @private
   */
  private async hasActiveAppointment(userId: string): Promise<boolean> {
    const { data, error } = await supabaseServer
      .from('appointments')
      .select('id')
      .eq('user_id', userId)
      .in('status', ['pending', 'confirmed'])
      .limit(1);

    if (error) {
      console.error(`Error checking appointments for user ${userId}:`, error);
      return false;
    }

    return (data && data.length > 0) || false;
  }

  /**
   * Verificar si el usuario respondió al auto-offer
   * 
   * @private
   */
  private async hasRespondedToAutoOffer(userId: string): Promise<boolean> {
    const { data, error } = await supabaseServer
      .from('user_progress')
      .select('appointment_offered, appointment_flow_state')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return false;
    }

    // Si se le ofreció cita Y tiene algún estado de flujo, significa que respondió
    return data.appointment_offered && data.appointment_flow_state !== null;
  }

  /**
   * Actualizar score después de completar checkpoint
   * (Helper para integración en message-processor)
   */
  async afterCheckpointCompleted(userId: string): Promise<void> {
    await this.recalculateAndUpdate(userId);
  }

  /**
   * Actualizar score después de crear cita
   * (Helper para integración en appointment-manager)
   */
  async afterAppointmentCreated(userId: string): Promise<void> {
    await this.recalculateAndUpdate(userId);
  }

  /**
   * Actualizar score después de responder a auto-offer
   * (Helper para integración en message-processor)
   */
  async afterAutoOfferResponse(userId: string): Promise<void> {
    await this.recalculateAndUpdate(userId);
  }
}

// Singleton
export const leadScorer = new LeadScorer();
