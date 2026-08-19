/**
 * Las sugerencias al escribir `{` en el editor de respuestas.
 *
 * Lo unico con logica es decidir si el cursor esta dentro de una llave sin
 * cerrar: de eso depende que la lista salga cuando toca y no salga cuando el
 * texto solo lleva una llave por casualidad.
 *
 *   npx tsx scripts/test-variable-suggestions.ts
 */
import { openVariableAt } from '../src/components/intents/VariableTextarea';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Fallo: ${message}`);
  console.log(`OK: ${message}`);
}

const cases: Array<{ text: string; caret: number; expect: string | null; why: string }> = [
  { text: 'Desde {', caret: 7, expect: '', why: 'recien escrita la llave, sugiere todo' },
  { text: 'Desde {pre', caret: 10, expect: 'pre', why: 'filtra por lo tecleado' },
  { text: 'Desde {precio} y algo', caret: 21, expect: null, why: 'con la llave ya cerrada, no sugiere' },
  { text: 'Desde {precio}', caret: 10, expect: 'pre', why: 'el cursor dentro de una llave abierta hacia atras sigue sugiriendo' },
  { text: 'Horario de 9 a 6 {', caret: 18, expect: '', why: 'una llave al final de una frase larga tambien abre' },
  { text: 'Tenemos { dos', caret: 13, expect: null, why: 'un espacio despues de la llave no es un nombre de dato' },
  { text: 'linea\n{ent', caret: 10, expect: 'ent', why: 'funciona en la segunda linea' },
  { text: 'sin llaves', caret: 10, expect: null, why: 'sin llave no hay nada que sugerir' },
];

for (const testCase of cases) {
  const found = openVariableAt(testCase.text, testCase.caret);
  const query = found ? found.query : null;
  assert(query === testCase.expect, `${testCase.why} (${JSON.stringify(query)})`);
}

console.log('\nSugerencias verificadas: la lista sale cuando se esta nombrando un dato, y solo entonces');
