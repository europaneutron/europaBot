/**
 * Tipos para el sistema de detección de intenciones
 */

export interface IntentConfiguration {
  id: string;
  intent_name: string;
  display_name: string;
  keywords: string[];
  synonyms: string[];
  typos: string[];
  phrases: string[];
  min_confidence: number;
  priority: number;
  response_type: string;
  is_active: boolean;
  is_checkpoint: boolean;
}

export interface IntentMatch {
  intent_name: string;
  confidence: number;
  matched_keywords: string[];
  fuzzy_matches: FuzzyMatch[];
  detection_method: 'exact' | 'synonym' | 'typo' | 'phrase' | 'fuzzy';
}

export interface FuzzyMatch {
  keyword: string;
  matched_word: string;
  similarity: number;
  method: string;
}

export interface DetectionResult {
  detected: boolean;
  intent?: IntentMatch;
  normalized_message: string;
  all_matches: IntentMatch[];
}
