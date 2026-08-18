export type CompilerStage =
  | 'ingest'
  | 'extract_facts'
  | 'consolidate_facts'
  | 'tree'
  | 'catalog'
  | 'content'
  | 'review'
  | 'completed';

export type ReviewSignal =
  | 'unsupported'
  | 'contradiction'
  | 'uncertain_provenance'
  | 'sensitive_data'
  | 'changed'
  | 'human_edited'
  | 'poor_vocabulary'
  | 'vocabulary_regression';

export interface MatcherPatterns {
  keywords: string[];
  synonyms: string[];
  typos: string[];
  phrases: string[];
}

export interface VocabularyReachResult {
  reached: string[];
  missed: string[];
}

export interface ExtractedFact {
  id?: string;
  materialId: string;
  scopeId: string;
  key: string;
  subject?: string | null;
  value: unknown;
  type: string;
  page: number;
  provenanceConfidence: number;
  fingerprint: string;
  contradictory?: boolean;
}

export interface CandidateQuestion {
  intentName: string;
  question: string;
  source: 'preset' | 'material' | 'fallback';
  factKeys: string[];
}

export interface CompilerProposal {
  id: string;
  run_id: string;
  scope_id: string;
  intent_id: string;
  response_key: string;
  message_text: { fragments: Array<{ type: 'text'; content: string; delay: number }> };
  matcher_patterns: Record<string, string[]>;
  approval_status: 'pending' | 'approved' | 'rejected';
  review_signals: ReviewSignal[];
  approved_with_signals: ReviewSignal[];
  edited_by_human: boolean;
  created_at: string;
}

/**
 * Vocabulario cerrado para la estructura que el modelo propone.
 *
 * Antes `scope_type` era texto libre, y el modelo devolvia lo que le pareciera:
 * `section` y `product` para una factura, `desarrollo`, `modelo`, `etapa`,
 * `amenidad` y `unidad_conjunto` para un brochure. Como el recorrido ofrecia
 * como "opciones que se venden por separado" a todos los hijos del proyecto sin
 * mirar el tipo, la Casa club y el Circuito de trote de un fraccionamiento
 * llegaban a la pantalla como si fueran casas en venta, y de aceptarlos habrian
 * quedado como alcances con alias propios: un lead que escribe "casa club" se
 * habria enrutado a un producto inexistente.
 *
 * Lo que decide si algo se vende por separado es una clasificacion, y una
 * clasificacion se pide con un vocabulario cerrado, igual que ya se hacia con
 * el tipo de los hechos.
 */
export const SCOPE_TYPE_VALUES = [
  'proyecto',
  'opcion',
  'amenidad',
  'etapa',
  'otro',
] as const;

export type ProposedScopeType = typeof SCOPE_TYPE_VALUES[number];

/**
 * Tipos que en corridas anteriores significaban "esto se vende por separado".
 * Se mantienen para no reinterpretar arboles ya guardados.
 */
const LEGACY_SELLABLE_TYPES = new Set([
  'opcion',
  'model',
  'modelo',
  'product',
  'producto',
  'prototipo',
  'unidad',
]);

const KNOWN_NON_SELLABLE_TYPES = new Set([
  'amenidad',
  'amenity',
  'etapa',
  'stage',
  'seccion',
  'section',
  'servicio',
  'proyecto',
  'desarrollo',
  'negocio',
]);

/**
 * Ante un tipo desconocido devuelve `true`: es preferible mostrar de mas y que
 * la persona lo borre, a esconder una opcion real que si se vende.
 */
export function isSellableScopeType(value: string | null | undefined): boolean {
  const normalized = (value || '').trim().toLowerCase();
  if (!normalized) return true;
  if (LEGACY_SELLABLE_TYPES.has(normalized)) return true;
  return !KNOWN_NON_SELLABLE_TYPES.has(normalized);
}
