import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.development.local') });
config({ path: resolve(process.cwd(), '.env.local') });

import {
  changedFactFingerprints,
  consolidateFacts,
  deriveCoverage,
  factFingerprint,
  mergeCandidates,
  REAL_ESTATE_PRESET,
  reviewSignalsForFacts,
  sharedFactsForAncestor,
} from '../src/core/document-compiler/compiler-rules';
import type { ExtractedFact } from '../src/data/models/document-compiler.model';
import baseline from '../openspec/changes/document-compiler/baseline.json';
import { readFileSync } from 'node:fs';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Fallo: ${message}`);
  console.log(`OK: ${message}`);
}

function fact(overrides: Partial<ExtractedFact> = {}): ExtractedFact {
  const key = overrides.key || 'price_from';
  const value = overrides.value ?? 1_950_000;
  return {
    id: overrides.id || crypto.randomUUID(),
    materialId: overrides.materialId || crypto.randomUUID(),
    scopeId: overrides.scopeId || crypto.randomUUID(),
    key,
    subject: overrides.subject ?? null,
    value,
    type: overrides.type || 'money',
    page: overrides.page || 2,
    provenanceConfidence: overrides.provenanceConfidence ?? 1,
    fingerprint: overrides.fingerprint || factFingerprint(key, value, overrides.subject ?? null),
    contradictory: overrides.contradictory,
  };
}

const repeated = fact();
const contradictory = fact({ value: 2_100_000 });
const withoutPage = fact({ page: 0 });
const consolidated = consolidateFacts([repeated, repeated, contradictory, withoutPage]);
assert(consolidated.length === 2, 'deduplica y descarta hechos sin página válida');
assert(consolidated.every(item => item.contradictory), 'reporta valores contradictorios sin elegir uno');

const coverage = deriveCoverage([repeated]);
assert(coverage.find(item => item.intentName === 'precio')?.status === 'covered', 'marca una pregunta respaldada como cubierta');
assert(coverage.find(item => item.intentName === 'creditos')?.status === 'gap', 'reporta el preset sin respaldo como hueco');

const signals = reviewSignalsForFacts([repeated, fact({ provenanceConfidence: 0.4 })], { changed: true });
assert(signals.includes('sensitive_data'), 'señala dinero mediante una regla determinista');
assert(signals.includes('uncertain_provenance'), 'señala procedencia dudosa');
assert(signals.includes('changed'), 'señala hechos cambiados durante recompilación');

const childA = fact({ scopeId: 'child-a' });
const childB = { ...childA, id: crypto.randomUUID(), scopeId: 'child-b' };
const shared = sharedFactsForAncestor(new Map([['child-a', [childA]], ['child-b', [childB]]]));
assert(shared.length === 1, 'identifica hechos idénticos compartidos por todos los hijos');

const changed = changedFactFingerprints([repeated], [fact({ value: 2_000_000 })]);
assert(changed.has('price_from'), 'la recompilación compara hechos y detecta el cambio');
assert(changedFactFingerprints([repeated], [{ ...repeated }]).size === 0, 'un hecho sin cambios no regenera contenido');

const processorSource = readFileSync(resolve(process.cwd(), 'src/core/conversation/message-processor.ts'), 'utf8');
assert(!processorSource.includes('document-compiler'), 'el runtime no importa el compilador');
assert(baseline.runtime.callsModelDuringMessage === false, 'la línea base no llama al modelo durante el mensaje');

// Un catalogo no es una contradiccion. Es la forma mas comun del material, y
// marcarla encendia la senal en casi toda propuesta de precio.
const catalogFacts = ['Toscana', 'Milano', 'Verona'].map((subject, index) => fact({
  id: crypto.randomUUID(),
  key: 'precio',
  subject,
  value: 1_950_000 + index * 400_000,
  page: 7 + index,
  fingerprint: factFingerprint('precio', 1_950_000 + index * 400_000, subject),
}));
const consolidatedCatalog = consolidateFacts(catalogFacts);
assert(
  consolidatedCatalog.every(row => !row.contradictory),
  'tres modelos con tres precios no son una contradicción'
);

const conflictingFacts = [1_950_000, 2_100_000].map((value, index) => fact({
  id: crypto.randomUUID(),
  key: 'precio',
  subject: 'Toscana',
  value,
  page: 7 + index * 7,
  fingerprint: factFingerprint('precio', value, 'Toscana'),
}));
assert(
  consolidateFacts(conflictingFacts).every(row => row.contradictory),
  'el mismo sujeto con dos valores sí es una contradicción'
);

// El material y el prompt estan en espanol: esperar solo claves en ingles
// convertia en hueco todo lo que el documento si responde.
for (const key of ['price', 'precio', 'precio_desde', 'starting_price']) {
  const coverage = deriveCoverage(
    [fact({ id: crypto.randomUUID(), key, fingerprint: factFingerprint(key, 1_950_000) })],
    mergeCandidates(REAL_ESTATE_PRESET, [])
  );
  assert(
    coverage.find(row => row.intentName === 'precio')?.status === 'covered',
    `la clave "${key}" cubre la pregunta de precio`
  );
}

const mergedCandidates = mergeCandidates(REAL_ESTATE_PRESET, [{
  intentName: 'precio',
  question: '¿Cuánto cuesta?',
  source: 'material',
  factKeys: ['valor_unidad'],
}]);
assert(
  mergedCandidates.filter(row => row.intentName === 'precio').length === 1,
  'el preset y el material no producen dos filas para la misma intención'
);
assert(
  deriveCoverage(
    [fact({ id: crypto.randomUUID(), key: 'valor_unidad', fingerprint: factFingerprint('valor_unidad', 1) })],
    mergedCandidates
  ).find(row => row.intentName === 'precio')?.status === 'covered',
  'la clave que el propio modelo nombró cubre la pregunta del preset'
);

// La senal de dato sensible no puede depender de como tipifique el modelo.
assert(
  reviewSignalsForFacts([fact({ type: 'text', value: '$1,950,000 MXN' })]).includes('sensitive_data'),
  'una cifra de dinero se señala aunque el modelo la tipifique como texto'
);
assert(
  !reviewSignalsForFacts([fact({ type: 'text', value: 'alberca techada', subject: null })]).includes('sensitive_data'),
  'un dato sin cifras ni fechas no se señala como sensible'
);

console.log('Document compiler rules verified');
