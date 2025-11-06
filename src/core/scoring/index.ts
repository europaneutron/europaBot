/**
 * Scoring Module - Sistema de puntuación de leads
 * 
 * Exports:
 * - leadScorer: Instancia singleton del scorer
 * - LeadScorer: Clase del scorer
 * - LeadStatus: Tipo de status del lead
 * - LeadScoreBreakdown: Desglose detallado del score
 */

export { leadScorer, LeadScorer } from './lead-scorer';
export type { LeadStatus, LeadScoreBreakdown } from './lead-scorer';
