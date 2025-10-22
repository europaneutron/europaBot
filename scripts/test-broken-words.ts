/**
 * Test de reconstrucción de palabras separadas
 * Ejecutar con: npx tsx scripts/test-broken-words.ts
 */

import { FuzzyMatcher } from '../src/core/intent-engine/fuzzy-matcher';
import type { IntentConfiguration } from '../src/types/intent.types';

// Mock de intents
const mockIntents: IntentConfiguration[] = [
  {
    id: '1',
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

console.log('🧪 Testing reconstrucción de palabras separadas\n');

const testCases = [
  // Palabras separadas
  'pre cios',
  'pre cio',
  'ubi cacion',
  'u bi ca cion',
  'don de esta',
  'do nde queda',
  
  // Normales (no deben afectarse)
  'precio',
  'cuanto cuesta',
  'donde esta',
  
  // Mixtos
  'cual es el pre cio',
  'don de que da'
];

testCases.forEach(message => {
  console.log(`📝 Input: "${message}"`);
  const result = matcher.detectIntent(message);
  
  if (result.detected && result.intent) {
    console.log(`✅ Intent: ${result.intent.intent_name}`);
    console.log(`   Normalized: "${result.normalized_message}"`);
    console.log(`   Confidence: ${(result.intent.confidence * 100).toFixed(1)}%`);
    console.log(`   Method: ${result.intent.detection_method}`);
  } else {
    console.log(`❌ No detectado`);
    console.log(`   Normalized: "${result.normalized_message}"`);
  }
  console.log('');
});

console.log('✅ Test completado');
