/**
 * Persona en Ajustes (conversacion-con-ia, tareas 10.1 a 10.3): aviso de prohibiciones,
 * captura de teléfonos y que la vista previa sea exactamente el texto del prompt.
 *
 *   npx tsx scripts/test-ai-persona.ts
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { findPersonaProhibitions, personaToConfig, PERSONA_NOTES_MAX_LENGTH } from '../src/lib/ai-persona';

config({ quiet: true, path: resolve(process.cwd(), '.env.development.local') });
config({ quiet: true, path: resolve(process.cwd(), '.env.local') });

async function main() {
  assert.deepEqual(findPersonaProhibitions('Cercano y claro'), []);
  assert.deepEqual(findPersonaProhibitions('NUNCA uses jerga'), ['nunca']);
  assert.deepEqual(findPersonaProhibitions('Jamás hables de política'), ['jamas']);
  assert.deepEqual(findPersonaProhibitions('Está PROHIBIDO prometer; nunca, nunca'), ['prohibido', 'nunca']);
  assert.deepEqual(findPersonaProhibitions('Temas prohibidos y cosas prohibidas'), ['prohibidos', 'prohibidas']);
  assert.deepEqual(findPersonaProhibitions('Es una persona nunciadora y jamaicana'), [], 'solo palabras completas');
  assert.equal(PERSONA_NOTES_MAX_LENGTH, 600);

  const { buildPersona } = await import('../src/core/ai-conversation/context-builder');
  const persona = buildPersona(personaToConfig({ name: 'Sofía', register: 'usted', emojis: 'no', length: 'media', notes: 'Cercana y clara' }), 'FYMSA');
  for (const expected of ['Eres el asistente de FYMSA.', 'Te llamas Sofía.', 'Hablas de usted.', 'Te expresas con palabras y signos de puntuación.',
    'Respondes con una extensión media.', 'Notas de personalidad del negocio: Cercana y clara']) {
    assert(persona.includes(expected), `falta: ${expected}`);
  }
  const defaults = buildPersona(personaToConfig({ name: '', register: 'tu', emojis: 'pocos', length: 'corta', notes: '' }), null);
  assert(defaults.includes('Hablas de tú.') && defaults.includes('con moderación') && !defaults.includes('Te llamas'));
  console.log('Persona en Ajustes: avisos y vista previa verificados.');
}

main().catch(error => { console.error(error); process.exit(1); });
