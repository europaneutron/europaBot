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
import { appointmentRepository } from '@/data/repositories/appointment.repository';
import { ROOT_SCOPE_ID, scopeRepository } from '@/data/repositories/scope.repository';

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
  async calculateScore(userId: string, scopeId: string = ROOT_SCOPE_ID): Promise<number> {
    const breakdown = await this.getScoreBreakdown(userId, scopeId);
    return breakdown.totalScore;
  }

  /**
   * Obtener desglose completo del score
   * 
   * @param userId - ID del usuario
   * @returns Desglose detallado del score
   */
  async getScoreBreakdown(
    userId: string,
    scopeId: string = ROOT_SCOPE_ID
  ): Promise<LeadScoreBreakdown> {
    // Obtener configuración de puntos
    const checkpointPoints = await configRepository.getInt('checkpoint_points', 15);
    const appointmentPoints = await configRepository.getInt('appointment_points', 20);
    const autoOfferPoints = await configRepository.getInt('auto_offer_response_points', 10);

    // Obtener checkpoints completados
    const scopeIds = await scopeRepository.getScoringScopeIds(scopeId);
    const checkpointsCompleted = await userRepository.countCompletedCheckpoints(userId, scopeId);

    // Verificar si tiene cita agendada
    const hasAppointment = await appointmentRepository.hasActiveInScopes(userId, scopeIds);

    // Verificar si respondió a auto-offer
    const scopeProgress = await userRepository.getScopeProgressMany(userId, scopeIds);
    const respondedToAutoOffer = scopeProgress.some(
      progress => Boolean(progress.appointment_offer_responded_at)
    );

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
  async recalculateAndUpdate(
    userId: string,
    scopeId: string = ROOT_SCOPE_ID
  ): Promise<number> {
    const breakdown = await this.getScoreBreakdown(userId, scopeId);

    await userRepository.saveScopeLeadScore(
      userId,
      scopeId,
      breakdown.totalScore,
      breakdown.status
    );

    return breakdown.totalScore;
  }

  /**
   * Actualizar score después de completar checkpoint
   * (Helper para integración en message-processor)
   */
  async afterCheckpointCompleted(userId: string, scopeId: string): Promise<void> {
    await this.recalculateScopeAndBranch(userId, scopeId);
  }

  async afterScopeInteraction(userId: string, scopeId: string): Promise<void> {
    await this.recalculateScopeAndBranch(userId, scopeId);
  }

  /**
   * Actualizar score después de crear cita
   * (Helper para integración en appointment-manager)
   */
  async afterAppointmentCreated(userId: string, scopeId: string): Promise<void> {
    await this.recalculateScopeAndBranch(userId, scopeId);
  }

  /**
   * Actualizar score después de responder a auto-offer
   * (Helper para integración en message-processor)
   */
  async afterAutoOfferResponse(userId: string, scopeId: string): Promise<void> {
    await this.recalculateScopeAndBranch(userId, scopeId);
  }

  private async recalculateScopeAndBranch(userId: string, scopeId: string): Promise<void> {
    await this.recalculateAndUpdate(userId, scopeId);
    const branchId = await scopeRepository.getBranchId(scopeId);
    if (branchId && branchId !== scopeId) {
      await this.recalculateAndUpdate(userId, branchId);
    }
  }
}

// Singleton
export const leadScorer = new LeadScorer();
