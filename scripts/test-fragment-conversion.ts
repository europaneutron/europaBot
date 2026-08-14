/**
 * Prueba de conversión entre filas de bot_responses y bloques del editor.
 * Verifica ida y vuelta de los tres formatos, y que convertir una respuesta
 * legacy sin modificarla produce un resultado equivalente para el lead.
 *
 * No requiere el stack local: opera sobre datos en memoria.
 *
 * Ejecutar con: npx tsx scripts/test-fragment-conversion.ts
 */

import {
  responseRowToBlocks,
  blocksToFragmentedResponse,
  type ResponseRow,
} from '../src/lib/utils/response-blocks';
import { validateFragmentedResponse } from '../src/types/message-fragments.types';

let failures = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failures += 1;
    console.error(`  FALLA: ${message}`);
  } else {
    console.log(`  OK: ${message}`);
  }
}

// =====================================================
// Caso 1: respuesta fragmentada ida y vuelta
// =====================================================
console.log('Caso 1: respuesta fragmentada (ida y vuelta)');

const fragmentedRow: ResponseRow = {
  response_type: 'fragmented',
  media_url: null,
  message_text: {
    fragments: [
      { type: 'text', content: 'Hola', delay: 0 },
      { type: 'image', url: 'https://example.com/a.jpg', caption: 'Foto', delay: 1200 },
      { type: 'document', url: 'https://example.com/b.pdf', filename: 'b.pdf', delay: 800 },
    ],
  },
};

const fragmentedBlocks = responseRowToBlocks(fragmentedRow);
assert(fragmentedBlocks.length === 3, 'produce 3 bloques');
assert(fragmentedBlocks.every((block) => typeof block.id === 'string' && block.id.length > 0), 'cada bloque tiene id');

const fragmentedBack = blocksToFragmentedResponse(fragmentedBlocks);
const originalFragments = (fragmentedRow.message_text as { fragments: unknown[] }).fragments;
assert(
  JSON.stringify(fragmentedBack.fragments) === JSON.stringify(originalFragments),
  'serializar de vuelta reproduce los fragments originales'
);
assert(validateFragmentedResponse(fragmentedBack), 'el resultado pasa validateFragmentedResponse');

// =====================================================
// Caso 2: respuesta simple con media_url
// =====================================================
console.log('\nCaso 2: respuesta simple con media_url');

const simpleMediaRow: ResponseRow = {
  response_type: 'simple',
  message_text: 'Aqui la fachada',
  media_url: 'https://example.com/storage/1700000000000_fachada.jpg',
};

const simpleMediaBlocks = responseRowToBlocks(simpleMediaRow);
assert(simpleMediaBlocks.length === 2, 'produce un bloque de texto y uno de imagen');
assert(simpleMediaBlocks[0].type === 'text' && (simpleMediaBlocks[0] as any).content === 'Aqui la fachada', 'el primer bloque es el texto original');
assert(simpleMediaBlocks[1].type === 'image' && (simpleMediaBlocks[1] as any).url === simpleMediaRow.media_url, 'el segundo bloque referencia la misma media_url');

const simpleMediaFragmented = blocksToFragmentedResponse(simpleMediaBlocks);
assert(validateFragmentedResponse(simpleMediaFragmented), 'el resultado pasa validateFragmentedResponse');
assert(
  simpleMediaFragmented.fragments[0].type === 'text' && simpleMediaFragmented.fragments[1].type === 'image',
  'el orden de envio se conserva: texto antes que media'
);

// =====================================================
// Caso 3: respuesta simple de solo texto
// =====================================================
console.log('\nCaso 3: respuesta simple de solo texto');

const simpleTextRow: ResponseRow = {
  response_type: 'simple',
  message_text: 'Mensaje de solo texto',
  media_url: null,
};

const simpleTextBlocks = responseRowToBlocks(simpleTextRow);
assert(simpleTextBlocks.length === 1, 'produce un unico bloque');
assert(simpleTextBlocks[0].type === 'text' && (simpleTextBlocks[0] as any).content === 'Mensaje de solo texto', 'el bloque conserva el texto original');

const simpleTextFragmented = blocksToFragmentedResponse(simpleTextBlocks);
assert(validateFragmentedResponse(simpleTextFragmented), 'el resultado pasa validateFragmentedResponse');

// =====================================================
// Caso 4: documento con media_url sin extension reconocida cae a documento
// =====================================================
console.log('\nCaso 4: media_url de documento con nombre de archivo con timestamp');

const documentRow: ResponseRow = {
  response_type: 'simple',
  message_text: null,
  media_url: 'https://example.com/storage/1700000000000_ficha_tecnica.pdf',
};

const documentBlocks = responseRowToBlocks(documentRow);
assert(documentBlocks.length === 1, 'produce un unico bloque cuando no hay texto');
assert(documentBlocks[0].type === 'document', 'el bloque se detecta como documento por la extension .pdf');
assert((documentBlocks[0] as any).filename === 'ficha_tecnica.pdf', 'el filename remueve el timestamp, igual que el envio legacy');

console.log('\nCaso 5: media_url malformada');

const malformedUrlRow: ResponseRow = {
  response_type: 'simple',
  message_text: null,
  media_url: 'https://example.com/storage/1700000000000_ficha%ZZ.pdf',
};

const malformedUrlBlocks = responseRowToBlocks(malformedUrlRow);
assert(malformedUrlBlocks.length === 1, 'la URL malformada no interrumpe la conversión');
assert(malformedUrlBlocks[0].type === 'document', 'conserva el tipo de documento');
assert(
  malformedUrlBlocks[0].type === 'document' && malformedUrlBlocks[0].filename === 'ficha%ZZ.pdf',
  'usa el nombre codificado como respaldo'
);

console.log('\nCaso 6: documento cuyo nombre empieza con dígitos');

const numericFilenameRow: ResponseRow = {
  response_type: 'simple',
  message_text: null,
  media_url: 'https://example.com/storage/1700000000000_2026_catalogo.pdf',
};

const numericFilenameBlocks = responseRowToBlocks(numericFilenameRow);
assert(
  numericFilenameBlocks[0].type === 'document' && numericFilenameBlocks[0].filename === '2026_catalogo.pdf',
  'remueve solo el timestamp de almacenamiento y conserva los dígitos del nombre original'
);

console.log(failures === 0 ? '\nTodos los casos pasaron.' : `\n${failures} caso(s) fallaron.`);
process.exit(failures === 0 ? 0 : 1);
