import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.development.local') });
config({ path: resolve(process.cwd(), '.env.local') });

import {
  catalogLeadPhrases,
  changedFactFingerprints,
  consolidateFacts,
  deriveCoverage,
  factFingerprint,
  groupFactsByDestination,
  mergeCandidates,
  REAL_ESTATE_PRESET,
  reviewSignalsForFacts,
  sharedFactsForAncestor,
  shortScopeAlias,
  vocabularyReachesQuestion,
  vocabularyRegression,
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

const tree = [
  { id: 'development', parent_id: 'root', scope_type: 'proyecto' },
  { id: 'model-a', parent_id: 'development', scope_type: 'opcion' },
  { id: 'model-b', parent_id: 'development', scope_type: 'opcion' },
  { id: 'model-c', parent_id: 'development', scope_type: 'opcion' },
];
const pricesByModel = ['model-a', 'model-b', 'model-c'].map((scopeId, index) => fact({
  id: `price-${index}`,
  scopeId,
  subject: scopeId,
  value: 1_800_000 + index * 300_000,
  fingerprint: factFingerprint('price_from', 1_800_000 + index * 300_000, scopeId),
}));
const priceGroups = groupFactsByDestination(pricesByModel, 'development', tree);
assert(priceGroups.length === 3, 'tres precios distintos producen una respuesta por modelo');
assert(
  priceGroups.every(group => group.scopeId.startsWith('model-')),
  'cada precio se escribe en el modelo al que fue atribuido'
);

const developmentLocation = fact({
  id: 'location',
  scopeId: 'development',
  key: 'direccion',
  value: 'Avenida Central 100',
  type: 'location',
  fingerprint: factFingerprint('direccion', 'Avenida Central 100'),
});
assert(
  groupFactsByDestination([developmentLocation], 'development', tree)[0]?.scopeId === 'development',
  'una dirección sin sujeto permanece en el desarrollo'
);

const sharedAmenities = ['model-a', 'model-b', 'model-c'].map((scopeId, index) => fact({
  id: `amenity-${index}`,
  scopeId,
  key: 'amenidad',
  subject: scopeId,
  value: 'Casa club',
  type: 'text',
  fingerprint: factFingerprint('amenidad', 'Casa club', scopeId),
}));
const sharedGroups = groupFactsByDestination(sharedAmenities, 'development', tree);
assert(
  sharedGroups.length === 1 && sharedGroups[0].scopeId === 'development',
  'un hecho idéntico de varios modelos se escribe una sola vez en el desarrollo'
);
assert(
  sharedGroups[0].facts.length === 1,
  'el hecho compartido llega una sola vez al redactor y no una copia por modelo'
);

// Dos hermanos coinciden y el tercero no habla del tema. Subirlo al desarrollo
// haria que el tercero heredara algo que su material nunca le atribuyo.
const partialAmenities = ['model-a', 'model-b'].map((scopeId, index) => fact({
  id: `cochera-${index}`,
  scopeId,
  key: 'cochera',
  subject: scopeId,
  value: 'Cochera techada para 2 autos',
  type: 'text',
  fingerprint: factFingerprint('cochera', 'Cochera techada para 2 autos', scopeId),
}));
const partialGroups = groupFactsByDestination(partialAmenities, 'development', tree);
assert(
  partialGroups.length === 2 && partialGroups.every(group => group.scopeId.startsWith('model-')),
  'un hecho que dos modelos comparten y el tercero calla no sube al desarrollo'
);

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

// Una enumeracion no es un conflicto: tres formas de financiamiento no se
// desmienten entre si. Salio de la primera ejecucion real contra un PDF.
const listFacts = ['Infonavit', 'Fovissste', 'Crédito bancario'].map(value => fact({
  id: crypto.randomUUID(),
  key: 'financiamiento_aceptado',
  type: 'contractual',
  value,
  fingerprint: factFingerprint('financiamiento_aceptado', value),
}));
assert(
  consolidateFacts(listFacts).every(row => !row.contradictory),
  'una lista de opciones no se marca como contradicción'
);

const amenityFacts = ['Caseta de vigilancia 24 horas', 'Acceso controlado'].map(value => fact({
  id: crypto.randomUUID(),
  key: 'amenidad',
  type: 'text',
  value,
  fingerprint: factFingerprint('amenidad', value),
}));
assert(
  consolidateFacts(amenityFacts).every(row => !row.contradictory),
  'varias amenidades no son una contradicción'
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

const emptyVocabulary = vocabularyReachesQuestion({
  keywords: [], synonyms: [], typos: [], phrases: [],
}, '¿Cuánto cuesta?', ['que precio tiene', 'cuanto vale']);
assert(
  emptyVocabulary.reached.length === 0 && emptyVocabulary.missed.length === 3,
  'un vocabulario vacío no alcanza la pregunta que dice cubrir'
);

const materialVocabulary = vocabularyReachesQuestion({
  keywords: ['costo', 'casas'],
  synonyms: ['precio', 'cuesta'],
  typos: ['presio'],
  phrases: ['cuanto vale una casa', 'que precio tienen las casas', 'cuanto cuesta'],
}, '¿Cuánto cuesta?', ['que precio tienen las casas', 'cuanto vale una casa']);
assert(
  materialVocabulary.missed.length === 0,
  'sinónimos y frases del material alcanzan las formas del lead'
);

const fuzzyVocabulary = vocabularyReachesQuestion({
  keywords: ['precio', 'importe'],
  synonyms: ['costo', 'valor'],
  typos: ['presio'],
  phrases: ['cuanto cuesta', 'que precio tiene', 'cuanto vale'],
}, 'prescio', []);
assert(
  fuzzyVocabulary.reached.length === 1,
  'la comprobación hereda el matching difuso del matcher del runtime'
);

const regression = vocabularyRegression({
  keywords: ['precio', 'costo'], synonyms: [], typos: [], phrases: [],
}, {
  keywords: ['precio', 'costo'], synonyms: ['valor'], typos: [], phrases: ['cuanto vale'],
});
assert(
  regression.missed.includes('cuanto vale'),
  'detecta las formas anteriores que el vocabulario nuevo deja de reconocer'
);
const expandedVocabulary = vocabularyRegression({
  keywords: ['precio', 'costo'], synonyms: ['valor', 'importe'], typos: [], phrases: ['cuanto vale'],
}, {
  keywords: ['precio'], synonyms: ['valor'], typos: [], phrases: ['cuanto vale'],
});
assert(
  expandedVocabulary.missed.length === 0,
  'un vocabulario que conserva y amplía las formas anteriores no se marca'
);

const stablePrice = mergeCandidates(REAL_ESTATE_PRESET, [{
  intentName: 'precio_modelos',
  question: '¿Cuánto cuestan los modelos?',
  source: 'material',
  factKeys: ['precio_modelo'],
}]);
assert(
  stablePrice.some(row => row.intentName === 'precio')
    && !stablePrice.some(row => row.intentName === 'precio_modelos'),
  'una pregunta conocida se mapea al nombre estable del catálogo'
);

const warehouseCandidate = mergeCandidates(REAL_ESTATE_PRESET, [{
  intentName: 'ficha_producto',
  question: '¿Cuánto peso soporta?',
  source: 'material',
  factKeys: ['capacidad_carga'],
}]);
assert(
  warehouseCandidate.some(row => row.intentName === 'capacidad_carga'),
  'una pregunta de otro sector conserva un nombre estable en lengua del lead'
);
const stableCustomName = mergeCandidates(REAL_ESTATE_PRESET, [{
  intentName: 'otra_redaccion',
  question: '¿Qué carga máxima admite esta bodega?',
  source: 'material',
  factKeys: ['capacidad_carga'],
}]);
assert(
  stableCustomName.some(row => row.intentName === 'capacidad_carga'),
  'dos redacciones sobre los mismos hechos producen el mismo nombre nuevo'
);
const boundedCustomName = mergeCandidates(REAL_ESTATE_PRESET, [{
  intentName: 'nombre_largo',
  question: '¿Qué incluye?',
  source: 'material',
  factKeys: ['casas', 'etapas', 'lotes', 'numero', 'residenciales', 'viviendas'],
}]).find(row => row.source === 'material')?.intentName || '';
assert(
  boundedCustomName.length <= 41 && `compiler_${boundedCustomName}`.length <= 50,
  'un nombre nuevo deja espacio para la clave de respuesta sin perder estabilidad'
);

// El horario de FYMSA llegaba como `atencion_domingo_horario_lunes_s_6b885bae`:
// las palabras de cinco hechos ordenadas alfabeticamente y recortadas con hash.
const scheduleName = mergeCandidates(REAL_ESTATE_PRESET, [{
  intentName: 'horario',
  question: '¿Cuál es el horario de atención en sitio de Residencial Europa?',
  source: 'material',
  factKeys: [
    'horario_atención_sitio_domingo',
    'horario_atención_sitio_lunes_a_sábado',
    'horario_atención_sitio_lunes_a_viernes',
    'horario_atención_sitio_sábado',
  ],
}]).find(row => row.source === 'material')?.intentName || '';
assert(
  scheduleName === 'horario_atencion_sitio',
  'el nombre nuevo se lee en la lengua del material y no lleva hash'
);
const shuffledScheduleName = mergeCandidates(REAL_ESTATE_PRESET, [{
  intentName: 'horario',
  question: '¿A qué hora abren?',
  source: 'material',
  factKeys: [
    'horario_atención_sitio_sábado',
    'horario_atención_sitio_lunes_a_viernes',
    'horario_atención_sitio_domingo',
  ],
}]).find(row => row.source === 'material')?.intentName || '';
assert(
  shuffledScheduleName === scheduleName,
  'el orden en que llegan los hechos no cambia el nombre'
);
assert(shortScopeAlias('Modelo Solara') === 'Solara', 'un modelo publica su nombre comercial como alias corto');
assert(shortScopeAlias('Bodega Atlas') === 'Atlas', 'el alias corto no está limitado al sector vivienda');
assert(
  catalogLeadPhrases([fact({ key: 'cantidad de casas' })]).includes('que casas manejan'),
  'el catalogo convierte el nombre del producto del material en una pregunta alcanzable'
);
const warehouseCatalogPhrases = catalogLeadPhrases([fact({ key: 'cantidad de bodegas' })]);
assert(
  warehouseCatalogPhrases.includes('que bodegas manejan')
    && !warehouseCatalogPhrases.some(phrase => phrase.includes('casas')),
  'el vocabulario estructural no cablea el sector vivienda'
);
assert(
  catalogLeadPhrases([fact({ key: 'producto_ofrecido', value: 'consultorios' })])
    .includes('que consultorios manejan'),
  'el nombre comercial extraído se convierte en vocabulario del catálogo'
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
