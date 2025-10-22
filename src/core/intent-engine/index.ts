/**
 * Intent Engine - Motor de detección de intenciones
 * Exporta todos los componentes del sistema
 */

export { FuzzyMatcher } from './fuzzy-matcher';
export { IntentDetectionService, intentDetectionService } from './intent-detection.service';
export type { IntentConfiguration, IntentMatch, FuzzyMatch, DetectionResult } from '@/types/intent.types';
