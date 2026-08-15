/**
 * Script de prueba del Fuzzy Matcher
 * Ejecutar con: npx tsx scripts/test-matcher.ts
 */

import { FuzzyMatcher } from '../src/core/intent-engine/fuzzy-matcher';
import type { IntentConfiguration } from '../src/types/intent.types';

// Mock de intents para testing
const mockIntents: IntentConfiguration[] = [
  {
    id: '1',
    scope_id: null,
    intent_name: 'precio',
    display_name: 'Precio',
    keywords: ['precio', 'precios', 'costo', 'cuanto', 'vale'],
    synonyms: ['cotización', 'presupuesto', 'monto'],
    typos: ['presio', 'csto', 'cuato'],
    phrases: ['cuanto cuesta', 'cual es el precio', 'que precio tiene'],
    min_confidence: 0.75,
    priority: 10,
    response_type: 'text',
    is_active: true,
    is_checkpoint: true
  },
  {
    id: '2',
    scope_id: null,
    intent_name: 'ubicacion',
    display_name: 'Ubicación',
    keywords: ['ubicacion', 'donde', 'dirección', 'lugar'],
    synonyms: ['localización', 'encuentra', 'queda'],
    typos: ['ubicasion', 'dond', 'direcion'],
    phrases: ['donde esta', 'donde se encuentra', 'cual es la dirección'],
    min_confidence: 0.75,
    priority: 9,
    response_type: 'text',
    is_active: true,
    is_checkpoint: true
  }
];

const matcher = new FuzzyMatcher(mockIntents);

// Tests
console.log('🧪 Testing Fuzzy Matcher\n');

const testCases = [
  'hola cuanto cuesta',
  'cual es el precio?',
  'presio', // typo
  'cotización', // sinónimo
  'donde esta ubicado',
  'ubicasion', // typo
  'queda cerca de',
  'cuato vale', // typo en medio de frase
  'mensaje random sin intent',
];

testCases.forEach(message => {
  console.log(`📝 Mensaje: "${message}"`);
  const result = matcher.detectIntent(message);
  
  if (result.detected && result.intent) {
    console.log(`✅ Intent detectado: ${result.intent.intent_name}`);
    console.log(`   Confidence: ${(result.intent.confidence * 100).toFixed(1)}%`);
    console.log(`   Método: ${result.intent.detection_method}`);
    console.log(`   Keywords: ${result.intent.matched_keywords.join(', ')}`);
  } else {
    console.log('❌ No se detectó intención');
  }
  console.log('');
});

console.log('✅ Test completado');
