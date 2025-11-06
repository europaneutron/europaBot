/**
 * Fallback Module - Manejo de mensajes no entendidos
 * 
 * Exports:
 * - fallbackHandler: Instancia singleton del manejador de fallback
 * - FallbackLevel: Enum de niveles de fallback
 * - FALLBACK_MESSAGES: Templates de mensajes
 */

export { fallbackHandler, FallbackHandler } from './fallback-handler';
export { FallbackLevel, AdvisorDerivedState } from './fallback-levels.enum';
export { FALLBACK_MESSAGES } from './fallback-messages';
