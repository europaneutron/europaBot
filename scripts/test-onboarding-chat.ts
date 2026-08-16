import { config } from 'dotenv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.development.local') });
config({ path: resolve(process.cwd(), '.env.local') });

import {
  normalizeScopeAlias,
  renderClientVocabulary,
  toClientVocabulary,
  toneInstruction,
  toneSamples,
} from '../src/core/onboarding/client-vocabulary';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Fallo: ${message}`);
  console.log(`OK: ${message}`);
}

// Un nombre propio no es un tipo de proyecto. La direccion que el bot manda a
// un lead que va a ir fisicamente no puede reescribirse porque el cliente use
// otra palabra para su catalogo.
const conNombrePropio = 'Calle Principal #123, Fraccionamiento Europa, Ciudad';
const vocabulary = toClientVocabulary({
  project_singular: 'plaza',
  project_plural: 'plazas',
  is_configured: true,
});
assert(
  renderClientVocabulary(conNombrePropio, vocabulary) === conNombrePropio,
  'un nombre propio dentro de un mensaje no se reescribe'
);

// Tampoco los sustantivos comunes: "desarrollo" y "proyecto" son palabras del
// espanol antes que categorias del producto.
const prosaNormal = 'Este proyecto tiene un desarrollo sustentable.';
assert(
  renderClientVocabulary(prosaNormal, vocabulary) === prosaNormal,
  'las palabras comunes del idioma no se reescriben'
);

assert(
  renderClientVocabulary('¿De cuál {project_singular} te interesa?', vocabulary)
    === '¿De cuál plaza te interesa?',
  'la palabra del cliente entra donde el mensaje la marca'
);
assert(
  renderClientVocabulary('{project_singular_title}: {project_plural}', vocabulary) === 'Plaza: plazas',
  'las variables de interfaz y mensajes comparten la misma regla'
);

const sinConfigurar = toClientVocabulary({
  project_singular: 'plaza',
  project_plural: 'plazas',
  is_configured: false,
});
assert(
  renderClientVocabulary('Visita el Fraccionamiento Europa.', sinConfigurar)
    === 'Visita el Fraccionamiento Europa.',
  'un cliente existente conserva literalmente sus mensajes'
);

assert(normalizeScopeAlias('Toscána Norte') === 'toscana norte', 'los nombres reconocibles se normalizan');

const samples = toneSamples('Toscana', '$2,100,000');
assert(samples.length === 3, 'el tono se elige entre tres muestras');
assert(samples.every(sample => sample.message.includes('Toscana')), 'las muestras usan el nombre del cliente');
assert(samples.every(sample => sample.message.includes('$2,100,000')), 'las muestras usan datos leidos del material');
assert(
  toneInstruction('direct').includes('dos frases breves'),
  'el tono directo evita convertir prosa publicitaria en respuestas largas'
);

const onboardingSource = readFileSync(
  resolve(process.cwd(), 'src/app/(dashboard)/onboarding/page.tsx'),
  'utf8'
);
const reviewSource = readFileSync(
  resolve(process.cwd(), 'src/app/(dashboard)/compiler/page.tsx'),
  'utf8'
);
for (const oldCopy of [
  'Selecciona un alcance',
  'Compilación por etapas',
  'Ejecutar siguiente etapa',
  'Hechos y procedencia',
  'El original queda conservado',
]) {
  assert(!reviewSource.includes(oldCopy), `la revision ya no muestra "${oldCopy}"`);
}
assert(onboardingSource.includes('No estoy seguro'), 'el recorrido siempre ofrece una salida recomendada');
assert(onboardingSource.includes('Paso {step} de 7'), 'el recorrido se limita a siete pasos');
assert(onboardingSource.includes('agendar visitas'), 'el unico objetivo se afirma y no se pregunta');

const compilerServiceSource = readFileSync(
  resolve(process.cwd(), 'src/core/document-compiler/document-compiler.service.ts'),
  'utf8'
);
assert(compilerServiceSource.includes('toneInstruction'), 'el tono elegido llega a la redaccion');

console.log('Onboarding chat rules verified');
