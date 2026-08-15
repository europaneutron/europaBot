/**
 * Fuzzy Matcher - Motor de detección inteligente de intenciones
 * Usa fastest-levenshtein para matching tolerante a errores
 */

import { distance } from 'fastest-levenshtein';
import type { IntentConfiguration, IntentMatch, FuzzyMatch, DetectionResult } from '@/types/intent.types';

export class FuzzyMatcher {
  private intents: IntentConfiguration[] = [];

  // Configuración del matcher
  private readonly EXACT_MATCH_THRESHOLD = 1.0;
  private readonly FUZZY_MATCH_THRESHOLD = 0.75; // 75% similaridad mínima
  private readonly PHRASE_MATCH_THRESHOLD = 0.80; // 80% para frases completas

  constructor(intents: IntentConfiguration[]) {
    this.intents = intents.filter(i => i.is_active);
  }

  /**
   * Normaliza texto: lowercase, quita acentos, múltiples espacios
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
      .replace(/[^\w\s]/g, ' ') // Quitar puntuación
      .replace(/\s+/g, ' ') // Múltiples espacios a uno
      .trim();
  }

  /**
   * Reconstruir palabras separadas incorrectamente
   * Ejemplo: "pre cios" → "precios", "ubi cacion" → "ubicacion"
   * IMPORTANTE: NO juntar palabras comunes del español
   */
  private reconstructBrokenWords(text: string): string {
    let reconstructed = text;
    
    // Lista de palabras comunes cortas que NO deben juntarse
    const commonWords = new Set([
      'me', 'te', 'se', 'le', 'la', 'el', 'lo', 'de', 'en', 'un', 'es', 'si', 
      'no', 'yo', 'tu', 'su', 'mi', 'al', 'da', 'va', 'ya', 'he', 'ha', 've',
      'dar', 'ver', 'por', 'con', 'sin', 'mas', 'son', 'hay', 'fue', 'era'
    ]);
    
    // Solo juntar si AMBAS palabras son muy cortas (1-2 letras) Y no son palabras comunes
    // "u bi" → "ubi", "pre cios" → "precios" (porque "u" y "pre" no están en commonWords)
    const words = reconstructed.split(/\s+/);
    const result: string[] = [];
    let i = 0;
    
    while (i < words.length) {
      const current = words[i];
      const next = words[i + 1];
      
      // Solo juntar si:
      // 1. Palabra actual es muy corta (1-2 letras)
      // 2. NO es una palabra común
      // 3. Hay una siguiente palabra
      if (current.length <= 2 && !commonWords.has(current) && next) {
        result.push(current + next);
        i += 2; // Saltar ambas palabras
      } else {
        result.push(current);
        i++;
      }
    }
    
    return result.join(' ');
  }

  /**
   * Calcula similaridad entre dos strings (0-1)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1.0;
    
    const dist = distance(str1, str2);
    return 1 - (dist / maxLength);
  }

  /**
   * Detecta match exacto en keywords
   */
  private detectExactMatch(
    words: string[],
    intent: IntentConfiguration
  ): IntentMatch | null {
    const matchedKeywords: string[] = [];

    for (const word of words) {
      // Buscar en keywords principales
      if (intent.keywords.some(k => k.toLowerCase() === word)) {
        matchedKeywords.push(word);
      }
    }

    if (matchedKeywords.length > 0) {
      return {
        intent_id: intent.id,
        scope_id: intent.scope_id,
        intent_name: intent.intent_name,
        confidence: this.EXACT_MATCH_THRESHOLD,
        matched_keywords: matchedKeywords,
        fuzzy_matches: [],
        detection_method: 'exact',
        is_checkpoint: intent.is_checkpoint,
        is_strong_signal: intent.is_strong_signal
      };
    }

    return null;
  }

  /**
   * Detecta match en sinónimos
   */
  private detectSynonymMatch(
    words: string[],
    intent: IntentConfiguration
  ): IntentMatch | null {
    const matchedKeywords: string[] = [];

    for (const word of words) {
      if (intent.synonyms.some(s => s.toLowerCase() === word)) {
        matchedKeywords.push(word);
      }
    }

    if (matchedKeywords.length > 0) {
      return {
        intent_id: intent.id,
        scope_id: intent.scope_id,
        intent_name: intent.intent_name,
        confidence: 0.95, // Sinónimo es casi tan bueno como exacto
        matched_keywords: matchedKeywords,
        fuzzy_matches: [],
        detection_method: 'synonym',
        is_checkpoint: intent.is_checkpoint,
        is_strong_signal: intent.is_strong_signal
      };
    }

    return null;
  }

  /**
   * Detecta typos conocidos
   */
  private detectTypoMatch(
    words: string[],
    intent: IntentConfiguration
  ): IntentMatch | null {
    const matchedKeywords: string[] = [];

    for (const word of words) {
      if (intent.typos.some(t => t.toLowerCase() === word)) {
        matchedKeywords.push(word);
      }
    }

    if (matchedKeywords.length > 0) {
      return {
        intent_id: intent.id,
        scope_id: intent.scope_id,
        intent_name: intent.intent_name,
        confidence: 0.90, // Typo conocido
        matched_keywords: matchedKeywords,
        fuzzy_matches: [],
        detection_method: 'typo',
        is_checkpoint: intent.is_checkpoint,
        is_strong_signal: intent.is_strong_signal
      };
    }

    return null;
  }

  /**
   * Detecta frases completas
   */
  private detectPhraseMatch(
    normalizedMessage: string,
    intent: IntentConfiguration
  ): IntentMatch | null {
    const fuzzyMatches: FuzzyMatch[] = [];
    
    // Reconstruir también el mensaje para frases
    const reconstructed = this.reconstructBrokenWords(normalizedMessage);

    for (const phrase of intent.phrases) {
      const normalizedPhrase = this.normalizeText(phrase);
      const similarity = this.calculateSimilarity(reconstructed, normalizedPhrase);

      if (similarity >= this.PHRASE_MATCH_THRESHOLD) {
        fuzzyMatches.push({
          keyword: phrase,
          matched_word: reconstructed,
          similarity,
          method: 'phrase'
        });
      }
    }

    if (fuzzyMatches.length > 0) {
      // Tomar la mejor coincidencia
      const bestMatch = fuzzyMatches.reduce((best, current) => 
        current.similarity > best.similarity ? current : best
      );

      return {
        intent_id: intent.id,
        scope_id: intent.scope_id,
        intent_name: intent.intent_name,
        confidence: bestMatch.similarity,
        matched_keywords: [bestMatch.keyword],
        fuzzy_matches: fuzzyMatches,
        detection_method: 'phrase',
        is_checkpoint: intent.is_checkpoint,
        is_strong_signal: intent.is_strong_signal
      };
    }

    return null;
  }

  /**
   * Detecta con fuzzy matching (Levenshtein)
   */
  private detectFuzzyMatch(
    words: string[],
    intent: IntentConfiguration
  ): IntentMatch | null {
    const fuzzyMatches: FuzzyMatch[] = [];
    const allKeywords = [...intent.keywords, ...intent.synonyms];

    for (const word of words) {
      // Solo palabras con más de 3 caracteres para evitar falsos positivos
      if (word.length < 3) continue;

      for (const keyword of allKeywords) {
        const normalizedKeyword = keyword.toLowerCase();
        const similarity = this.calculateSimilarity(word, normalizedKeyword);

        if (similarity >= this.FUZZY_MATCH_THRESHOLD) {
          fuzzyMatches.push({
            keyword,
            matched_word: word,
            similarity,
            method: 'levenshtein'
          });
        }
      }
    }

    if (fuzzyMatches.length > 0) {
      // Calcular confidence promedio
      const avgConfidence = fuzzyMatches.reduce((sum, m) => sum + m.similarity, 0) / fuzzyMatches.length;
      
      return {
        intent_id: intent.id,
        scope_id: intent.scope_id,
        intent_name: intent.intent_name,
        confidence: avgConfidence,
        matched_keywords: fuzzyMatches.map(m => m.matched_word),
        fuzzy_matches: fuzzyMatches,
        detection_method: 'fuzzy',
        is_checkpoint: intent.is_checkpoint,
        is_strong_signal: intent.is_strong_signal
      };
    }

    return null;
  }

  /**
   * MÉTODO PRINCIPAL: Detectar intención en mensaje
   */
  public detectIntent(message: string): DetectionResult {
    const normalizedMessage = this.normalizeText(message);
    
    // Reconstruir palabras separadas incorrectamente
    const reconstructedMessage = this.reconstructBrokenWords(normalizedMessage);
    
    const words = reconstructedMessage.split(' ').filter(w => w.length > 0);
    
    const allMatches: IntentMatch[] = [];

    // Evaluar cada intent
    for (const intent of this.intents) {
      // 1. Intentar match exacto (mayor prioridad)
      const exactMatch = this.detectExactMatch(words, intent);
      if (exactMatch) {
        allMatches.push(exactMatch);
        continue; // Si hay exacto, no buscar más para este intent
      }

      // 2. Intentar match de sinónimo
      const synonymMatch = this.detectSynonymMatch(words, intent);
      if (synonymMatch) {
        allMatches.push(synonymMatch);
        continue;
      }

      // 3. Intentar match de typo conocido
      const typoMatch = this.detectTypoMatch(words, intent);
      if (typoMatch) {
        allMatches.push(typoMatch);
        continue;
      }

      // 4. Intentar match de frase completa
      const phraseMatch = this.detectPhraseMatch(normalizedMessage, intent);
      if (phraseMatch) {
        allMatches.push(phraseMatch);
        continue;
      }

      // 5. Intentar fuzzy matching (última opción)
      const fuzzyMatch = this.detectFuzzyMatch(words, intent);
      if (fuzzyMatch && fuzzyMatch.confidence >= intent.min_confidence) {
        allMatches.push(fuzzyMatch);
      }
    }

    // Si hay matches, ordenar por confidence y priority
    if (allMatches.length > 0) {
      allMatches.sort((a, b) => {
        // Primero por confidence
        if (b.confidence !== a.confidence) {
          return b.confidence - a.confidence;
        }
        // Si empatan, por priority del intent
        const intentA = this.intents.find(i => i.id === a.intent_id);
        const intentB = this.intents.find(i => i.id === b.intent_id);
        return (intentB?.priority || 0) - (intentA?.priority || 0);
      });

      const bestMatch = allMatches[0];

      return {
        detected: true,
        intent: bestMatch,
        normalized_message: reconstructedMessage,
        all_matches: allMatches
      };
    }

    // No se detectó intención
    return {
      detected: false,
      normalized_message: reconstructedMessage,
      all_matches: []
    };
  }

  /**
   * Actualizar intents (útil cuando se editan en dashboard)
   */
  public updateIntents(intents: IntentConfiguration[]): void {
    this.intents = intents.filter(i => i.is_active);
  }
}
