import { createHash } from 'node:crypto';
import type {
  CandidateQuestion,
  ExtractedFact,
  MatcherPatterns,
  ReviewSignal,
  VocabularyReachResult,
} from '@/data/models/document-compiler.model';
import { isSellableScopeType } from '@/data/models/document-compiler.model';
import { FuzzyMatcher } from '@/core/intent-engine/fuzzy-matcher';

const SENSITIVE_FACT_TYPES = new Set(['money', 'date', 'contractual']);

// Cifras de dinero, porcentajes y fechas, reconocidos por su forma y no por
// como los haya etiquetado el modelo. Es la senal que cubre el riesgo
// comercial, y por eso no puede depender de un juicio del propio modelo: si se
// equivoca al tipificar un precio como texto, la senal desaparece justo en la
// respuesta que mas falta hacia revisar.
const SENSITIVE_VALUE_PATTERNS = [
  /(?:\$|mxn|usd|pesos|d[oó]lares)/i,
  /\b\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?\b/,
  /\b\d+(?:[.,]\d+)?\s*%/,
  /\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/,
  /\b(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/i,
  /\b(?:vigencia|vigente hasta|plazo|contrato|penalizaci[oó]n|anticipo|enganche)\b/i,
];

// El preset solo aporta la pregunta. Sus claves son alias para reconocer un
// hecho que el modelo pudo nombrar en cualquiera de los dos idiomas: el
// material esta en espanol y el prompt tambien, asi que esperar unicamente
// claves en ingles convertia en hueco todo lo que el documento si responde.
//
// `leadForms` son las maneras de preguntar eso mismo. No salen del material a
// proposito: un folleto no escribe preguntas, asi que pedirselas al modelo
// sobre el material es preguntarle a la fuente equivocada. Medido: `ubicacion`
// se publico con "donde queda" y "cual es la direccion", y "donde estan
// ubicados" caia al fallback --el matcher perdona el plural y la errata
// ("ubicaciones" 0.82, "ubicacon" 0.89) pero no un participio contra un
// sustantivo ("ubicados" contra "ubicacion", 0.55)--.
//
// Esto no es el "vocabulario del sector" que la spec prohibe: eso era inventar
// palabras de vivienda para un negocio que quiza no vende casas. Si el catalogo
// ya declaro que la pregunta es `ubicacion`, "donde estan" no es inmobiliario,
// es espanol. Fuera del catalogo el vocabulario sigue saliendo del material.
export const REAL_ESTATE_PRESET: CandidateQuestion[] = [
  { intentName: 'precio', question: '¿Cuál es el precio?', source: 'preset', factKeys: ['price', 'price_from', 'precio', 'precio_desde', 'costo', 'valor'], leadForms: ['cuanto cuesta', 'cuanto cuestan', 'que precio tienen', 'cuanto vale', 'precios', 'que precios manejan', 'desde cuanto'] },
  { intentName: 'ubicacion', question: '¿Dónde se ubica?', source: 'preset', factKeys: ['location', 'address', 'ubicacion', 'direccion', 'zona'], leadForms: ['donde estan', 'donde estan ubicados', 'donde queda', 'donde quedan', 'como llego', 'en que zona estan', 'cual es la direccion', 'me pasas la ubicacion'] },
  { intentName: 'modelo', question: '¿Qué modelos hay?', source: 'preset', factKeys: ['model', 'unit_type', 'modelo', 'tipo_unidad', 'prototipo', 'producto_ofrecido'], leadForms: ['que modelos hay', 'que modelos manejan', 'que opciones tienen', 'que tienen disponible', 'que manejan'] },
  { intentName: 'creditos', question: '¿Qué financiamiento aceptan?', source: 'preset', factKeys: ['financing', 'credit', 'financiamiento', 'credito', 'hipoteca', 'enganche'], leadForms: ['aceptan credito', 'que creditos aceptan', 'puedo pagar a meses', 'manejan financiamiento', 'cuanto es el enganche'] },
  { intentName: 'seguridad', question: '¿Qué seguridad ofrece?', source: 'preset', factKeys: ['security', 'seguridad', 'vigilancia'], leadForms: ['es seguro', 'que seguridad tiene', 'tiene vigilancia', 'hay caseta'] },
  { intentName: 'amenidades', question: '¿Qué amenidades tiene?', source: 'preset', factKeys: ['amenity', 'amenities', 'amenidad', 'amenidades', 'areas_comunes'], leadForms: ['que amenidades tiene', 'que amenidades tienen', 'que areas comunes hay', 'que incluye', 'tiene alberca'] },
  { intentName: 'brochure', question: '¿Dónde puedo ver el brochure?', source: 'preset', factKeys: ['brochure', 'catalogo', 'folleto'], leadForms: ['me mandas el brochure', 'tienen catalogo', 'me pasas informacion', 'hay folleto'] },
];

/**
 * Las formas del lead de una pregunta del catalogo. Vacio para una pregunta
 * que el catalogo no conoce: ahi el vocabulario sale del material y de nada
 * mas, que es la regla de `vocabulario-del-matcher`.
 */
export function presetLeadForms(intentName: string): string[] {
  const normalized = normalizeFactKey(intentName);
  return REAL_ESTATE_PRESET.find(item => item.intentName === normalized)?.leadForms || [];
}

/**
 * Normaliza una clave de hecho para compararla: minusculas, sin acentos y con
 * los separadores unificados.
 */
export function normalizeFactKey(key: string): string {
  return key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function keyMatchesAlias(factKey: string, alias: string): boolean {
  const normalizedKey = normalizeFactKey(factKey);
  const normalizedAlias = normalizeFactKey(alias);
  if (!normalizedKey || !normalizedAlias) return false;
  return normalizedKey === normalizedAlias
    || normalizedKey.startsWith(`${normalizedAlias}_`)
    || normalizedKey.endsWith(`_${normalizedAlias}`)
    || normalizedKey.includes(`_${normalizedAlias}_`);
}

const QUESTION_STOP_WORDS = new Set([
  'a', 'al', 'de', 'del', 'el', 'en', 'es', 'hay', 'la', 'las', 'lo', 'los',
  'para', 'por', 'que', 'se', 'son', 'tiene', 'un', 'una', 'y',
]);

const GENERIC_SCOPE_PREFIXES = new Set([
  'bodega', 'consultorio', 'desarrollo', 'fraccionamiento', 'local', 'lote',
  'modelo', 'paquete', 'plan', 'residencial', 'tipo', 'unidad',
]);

/**
 * El nombre completo queda como alias principal, pero el lead suele omitir el
 * descriptor del producto. La regla usa descriptores estructurales, no
 * vocabulario inmobiliario: tambien cubre Bodega Atlas y Consultorio Norte.
 */
export function shortScopeAlias(name: string): string | null {
  const words = name.trim().split(/\s+/);
  if (words.length < 2 || !GENERIC_SCOPE_PREFIXES.has(normalizeFactKey(words[0]))) return null;
  const alias = words.slice(1).join(' ').trim();
  return alias.length >= 2 ? alias : null;
}

/**
 * El nombre sale de los hechos --dos redacciones sobre los mismos hechos tienen
 * que producir el mismo nombre-- pero tiene que poder leerse.
 *
 * Juntar todas las palabras y ordenarlas alfabeticamente cumplia la estabilidad
 * y perdia el idioma: cinco hechos de horario producian
 * `atencion_domingo_horario_lunes_s_6b885bae`. Las palabras que estan en todos
 * los hechos son justo el asunto que comparten, y respetar el orden en que
 * aparecen las devuelve a la lengua del material: `horario_atencion_sitio`.
 */
function customIntentName(candidate: CandidateQuestion): string {
  // Las claves se ordenan antes de leerlas: el nombre no puede depender de en
  // que orden devolvio el modelo los hechos.
  const keyWords = Array.from(new Set(candidate.factKeys.map(normalizeFactKey)))
    .sort()
    .map(key => Array.from(new Set(
      key.split('_').filter(
        word => word.length > 1 && !QUESTION_STOP_WORDS.has(word)
      )
    )));
  const ordered = Array.from(new Set(keyWords.flat()));
  const shared = ordered.filter(word => keyWords.every(words => words.includes(word)));
  // Sin palabra comun no hay asunto compartido que nombrar; el orden de
  // aparicion sigue siendo estable porque los hechos llegan ordenados.
  const factWords = shared.length > 0 ? shared : ordered;
  if (factWords.length > 0) return boundedIntentName(factWords.slice(0, 4).join('_'));

  const questionWords = normalizeFactKey(candidate.question)
    .split('_')
    .filter(word => word.length > 1 && !QUESTION_STOP_WORDS.has(word));
  return boundedIntentName(questionWords.slice(0, 4).join('_') || 'pregunta_material');
}

function boundedIntentName(value: string): string {
  // response_key antepone `compiler_` y ambas columnas admiten 50 caracteres.
  if (value.length <= 41) return value;
  const suffix = createHash('sha256').update(value).digest('hex').slice(0, 8);
  return `${value.slice(0, 32).replace(/_+$/g, '')}_${suffix}`;
}

function stableCandidate(candidate: CandidateQuestion): CandidateQuestion {
  const normalizedIntent = normalizeFactKey(candidate.intentName);
  const exact = REAL_ESTATE_PRESET.find(item => item.intentName === normalizedIntent);
  const byFacts = REAL_ESTATE_PRESET.find(item =>
    candidate.factKeys.some(key => item.factKeys.some(alias => keyMatchesAlias(key, alias)))
  );
  const preset = exact || byFacts;
  if (preset) {
    return {
      ...preset,
      source: 'material',
      factKeys: Array.from(new Set([...preset.factKeys, ...candidate.factKeys])),
    };
  }
  return {
    ...candidate,
    intentName: customIntentName(candidate),
  };
}

/**
 * Une los candidatos del preset con los que el modelo dedujo del material.
 *
 * Se agrupan por intencion, no por pregunta: el preset aporta el enunciado y el
 * material aporta las claves con las que el modelo nombro sus propios hechos.
 * Mantenerlos separados producia dos filas para la misma intencion, una cubierta
 * y otra como hueco, que es peor que cualquiera de las dos por si sola.
 */
export function mergeCandidates(
  preset: CandidateQuestion[],
  material: CandidateQuestion[]
): CandidateQuestion[] {
  const byIntent = new Map<string, CandidateQuestion>();

  for (const candidate of [...preset, ...material.map(stableCandidate)]) {
    const existing = byIntent.get(candidate.intentName);
    if (!existing) {
      byIntent.set(candidate.intentName, { ...candidate, factKeys: [...candidate.factKeys] });
      continue;
    }
    existing.factKeys = Array.from(new Set([...existing.factKeys, ...candidate.factKeys]));
    if (existing.source === 'preset' && candidate.source === 'material') {
      existing.source = 'material';
    }
  }

  return Array.from(byIntent.values());
}

function matcherForPatterns(patterns: MatcherPatterns): FuzzyMatcher {
  return new FuzzyMatcher([{
    id: 'compiler-vocabulary-check',
    scope_id: null,
    intent_name: 'compiler_vocabulary_check',
    display_name: 'Comprobacion de vocabulario',
    ...patterns,
    min_confidence: 0.6,
    priority: 0,
    response_type: 'fragmented',
    is_active: true,
    is_checkpoint: false,
    is_strong_signal: false,
  }]);
}

/**
 * Comprueba vocabulario con el mismo matcher que atiende mensajes reales.
 * Devuelve el detalle para que una propuesta bloqueada sea explicable.
 */
export function vocabularyReachesQuestion(
  patterns: MatcherPatterns,
  question: string,
  paraphrases: string[]
): VocabularyReachResult {
  const matcher = matcherForPatterns(patterns);
  const probes = Array.from(new Set([question, ...paraphrases].map(value => value.trim()).filter(Boolean)));
  const reached: string[] = [];
  const missed: string[] = [];
  for (const probe of probes) {
    if (matcher.detectIntent(probe).detected) reached.push(probe);
    else missed.push(probe);
  }
  return { reached, missed };
}

export function vocabularyRegression(
  patterns: MatcherPatterns,
  previous: MatcherPatterns
): VocabularyReachResult {
  const previousForms = Array.from(new Set([
    ...previous.keywords,
    ...previous.synonyms,
    ...previous.typos,
    ...previous.phrases,
  ].map(value => value.trim()).filter(Boolean)));
  return vocabularyReachesQuestion(patterns, '', previousForms);
}

/**
 * Convierte nombres de producto presentes en las claves del material en
 * preguntas corrientes. La plantilla es generica; el sustantivo siempre sale
 * del documento, por lo que funciona igual para casas, bodegas o consultorios.
 */
export function catalogTermsFromFacts(facts: ExtractedFact[]): string[] {
  const terms = new Set<string>();

  for (const fact of facts) {
    const key = normalizeFactKey(fact.key);
    const match = key.match(/^(?:cantidad|numero)_de_(.+)$/)
      || key.match(/^(?:cantidad|numero)_(.+)$/)
      || key.match(/^venta_de_(.+)$/);
    if (match?.[1]) terms.add(match[1].replaceAll('_', ' '));

    if (key === 'producto_ofrecido' && typeof fact.value === 'string') {
      const term = normalizeFactKey(fact.value).replaceAll('_', ' ');
      if (term) terms.add(term);
    }
  }

  return Array.from(terms);
}

export function catalogLeadPhrases(facts: ExtractedFact[]): string[] {
  return catalogTermsFromFacts(facts).flatMap(term => [
    `que ${term} manejan`,
    `que ${term} hay`,
  ]);
}

export function factFingerprint(key: string, value: unknown, subject?: string | null): string {
  return createHash('sha256')
    .update(`${normalizeFactKey(key)}:${normalizeFactKey(subject || '')}:${stableJson(value)}`)
    .digest('hex');
}

function stableJson(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  const object = value as Record<string, unknown>;
  return JSON.stringify(
    Object.fromEntries(Object.keys(object).sort().map(key => [key, object[key]]))
  );
}

/**
 * Une duplicados y marca contradicciones.
 *
 * Una contradiccion es el mismo hecho sobre el **mismo sujeto** con dos valores
 * distintos. Agrupar solo por clave confundia un catalogo con un conflicto:
 * tres modelos con tres precios son tres filas de la clave `precio`, y no hay
 * nada que aclarar ahi. Marcarlas encendia la senal en casi toda propuesta de
 * precio, y una senal siempre encendida no ordena la revision: la anula.
 */
// Tipos cuyo valor es unico por naturaleza: un desarrollo tiene un precio por
// modelo, una fecha de entrega, una direccion. Un `text` con varios valores no
// es un conflicto: es una lista.
// `location` y `contractual` quedan fuera a proposito: el modelo etiqueta asi
// tanto una direccion unica como una enumeracion de opciones de credito, y en
// la primera ejecucion real contra un PDF marco "Infonavit, Fovissste y credito
// bancario" como conflicto por esa via.
const EXCLUSIVE_FACT_TYPES = new Set(['money', 'date', 'number']);
const EXCLUSIVE_VALUE_PATTERNS = [
  /^\s*(?:\$|mxn|usd)?\s*\d[\d.,]*\s*(?:%|m2|mxn|usd)?\s*$/i,
  /\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/,
  /\b\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/i,
];

/**
 * Dos valores de la misma clave y el mismo sujeto solo se contradicen si se
 * excluyen entre si.
 *
 * "Aceptamos Infonavit, Fovissste y credito bancario" son tres hechos de la
 * misma clave y ninguno desmiente a los otros: es una enumeracion. Marcarla
 * llenaba de señales las respuestas de financiamiento y amenidades, que es la
 * misma forma de ruido que ya costo un hallazgo con los precios por modelo.
 *
 * La exclusividad se decide por la forma del valor primero y por el tipo
 * declarado despues: equivocarse aqui solo desordena la revision, no expone al
 * lead, asi que aceptar la etiqueta del modelo como refuerzo es razonable.
 */
function valuesAreExclusive(facts: ExtractedFact[]): boolean {
  return facts.every(fact => {
    const rendered = typeof fact.value === 'string' ? fact.value : JSON.stringify(fact.value ?? '');
    return EXCLUSIVE_VALUE_PATTERNS.some(pattern => pattern.test(rendered))
      || EXCLUSIVE_FACT_TYPES.has(fact.type);
  });
}

export function consolidateFacts(facts: ExtractedFact[]): ExtractedFact[] {
  const bySubject = new Map<string, Map<string, ExtractedFact>>();

  for (const fact of facts) {
    if (!fact.materialId || !Number.isInteger(fact.page) || fact.page < 1) continue;
    const subjectKey = `${normalizeFactKey(fact.key)}::${normalizeFactKey(fact.subject || '')}`;
    const values = bySubject.get(subjectKey) || new Map<string, ExtractedFact>();
    if (!values.has(fact.fingerprint)) values.set(fact.fingerprint, fact);
    bySubject.set(subjectKey, values);
  }

  return Array.from(bySubject.values()).flatMap(values => {
    const rows = Array.from(values.values());
    const contradictory = rows.length > 1 && valuesAreExclusive(rows);
    return rows.map(fact => ({ ...fact, contradictory }));
  });
}

export function deriveCoverage(
  facts: ExtractedFact[],
  candidates: CandidateQuestion[] = REAL_ESTATE_PRESET
) {
  const factsByKey = new Map<string, ExtractedFact[]>();
  for (const fact of facts) {
    const rows = factsByKey.get(fact.key) || [];
    rows.push(fact);
    factsByKey.set(fact.key, rows);
  }

  return candidates.map(candidate => {
    const supportingFacts = Array.from(factsByKey.entries())
      .filter(([factKey]) => candidate.factKeys.some(alias => keyMatchesAlias(factKey, alias)))
      .flatMap(([, rows]) => rows);
    return {
      ...candidate,
      status: supportingFacts.length > 0 ? 'covered' as const : 'gap' as const,
      factIds: supportingFacts.flatMap(fact => fact.id ? [fact.id] : []),
    };
  });
}

export function reviewSignalsForFacts(
  facts: ExtractedFact[],
  options: { changed?: boolean; humanEdited?: boolean } = {}
): ReviewSignal[] {
  const signals = new Set<ReviewSignal>();
  if (facts.length === 0) signals.add('unsupported');
  if (facts.some(fact => fact.contradictory)) signals.add('contradiction');
  if (facts.some(fact => fact.provenanceConfidence < 0.8)) signals.add('uncertain_provenance');
  if (facts.some(isSensitiveFact)) signals.add('sensitive_data');
  if (options.changed) signals.add('changed');
  if (options.humanEdited) signals.add('human_edited');
  return Array.from(signals);
}

// Palabras que abren una pregunta abierta: si la ultima oracion de una
// respuesta empieza con una de estas, no es una pregunta de si/no aunque
// termine en "?".
const OPEN_QUESTION_STARTERS = [
  'que', 'cual', 'cuales', 'como', 'donde', 'cuando', 'cuanto', 'cuanta',
  'cuantos', 'cuantas', 'quien', 'quienes', 'por que',
];

/**
 * Una respuesta termina en pregunta de si/no cuando su ultima oracion acaba
 * en "?" y no arranca con una palabra interrogativa abierta. Es una
 * comprobacion de forma, del mismo tipo que ya usa la deteccion de datos
 * sensibles: no interpreta el lenguaje, reconoce su forma.
 */
export function endsInYesNoQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.endsWith('?')) return false;

  const openMark = trimmed.lastIndexOf('¿');
  const lastSentence = (openMark >= 0 ? trimmed.slice(openMark + 1) : trimmed).trim();
  const normalized = normalizeFactKey(lastSentence).replace(/_/g, ' ');
  const firstTwoWords = normalized.split(' ').slice(0, 2).join(' ');

  return !OPEN_QUESTION_STARTERS.some(starter => {
    const normalizedStarter = normalizeFactKey(starter).replace(/_/g, ' ');
    return normalized === normalizedStarter
      || normalized.startsWith(`${normalizedStarter} `)
      || firstTwoWords === normalizedStarter;
  });
}

/**
 * La comprobacion previa a publicar bloquea una respuesta que termina en
 * pregunta de si/no sin declarar que ofrece: sin eso, el afirmativo del lead
 * no tiene contra que resolverse.
 */
export function checkOfferDeclared(
  responseText: string,
  offersIntentName: string | null | undefined
): string | null {
  if (!endsInYesNoQuestion(responseText)) return null;
  if (offersIntentName && offersIntentName.trim().length > 0) return null;
  return 'La pregunta de si o no no tiene a que responder: no declara que ofrece.';
}

/**
 * La comprobacion previa a publicar bloquea una respuesta que reune datos de
 * mas de una rama sin decir de cual es cada uno. `branchNames` son las ramas
 * cuyos hechos alimentan esta respuesta; con una sola no hay nada que
 * nombrar.
 */
export function checkBranchesNamed(
  responseText: string,
  branchNames: string[]
): string | null {
  const distinctNames = Array.from(new Set(branchNames.map(name => name.trim()).filter(Boolean)));
  if (distinctNames.length < 2) return null;

  const normalizedText = normalizeFactKey(responseText).replace(/_/g, ' ');
  const missing = distinctNames.filter(name => {
    const normalizedName = normalizeFactKey(name).replace(/_/g, ' ');
    return normalizedName.length > 0 && !normalizedText.includes(normalizedName);
  });
  if (missing.length === 0) return null;
  return `La respuesta mezcla ${distinctNames.length} ramas sin nombrarlas: falta ${missing.join(', ')}.`;
}

/**
 * Un hecho es sensible por lo que dice, no por como lo etiqueto el modelo.
 * El tipo declarado se acepta como senal adicional, nunca como la unica.
 */
export function isSensitiveFact(fact: ExtractedFact): boolean {
  if (SENSITIVE_FACT_TYPES.has(fact.type)) return true;
  const rendered = typeof fact.value === 'string' ? fact.value : JSON.stringify(fact.value ?? '');
  return SENSITIVE_VALUE_PATTERNS.some(pattern => pattern.test(rendered));
}

export function changedFactFingerprints(
  previous: ExtractedFact[],
  current: ExtractedFact[]
): Set<string> {
  const group = (facts: ExtractedFact[]) => {
    const byKey = new Map<string, Set<string>>();
    for (const fact of facts) {
      const fingerprints = byKey.get(fact.key) || new Set<string>();
      fingerprints.add(fact.fingerprint);
      byKey.set(fact.key, fingerprints);
    }
    return byKey;
  };
  const previousByKey = group(previous);
  const currentByKey = group(current);
  const keys = new Set([
    ...Array.from(previousByKey.keys()),
    ...Array.from(currentByKey.keys()),
  ]);
  return new Set(
    Array.from(keys).filter(key => {
      const before = Array.from(previousByKey.get(key) || []).sort().join(':');
      const after = Array.from(currentByKey.get(key) || []).sort().join(':');
      return before !== after;
    })
  );
}

export function sharedFactsForAncestor(
  factsByChild: Map<string, ExtractedFact[]>
): ExtractedFact[] {
  const children = Array.from(factsByChild.values());
  if (children.length < 2) return [];

  const first = children[0];
  return first.filter(candidate =>
    children.slice(1).every(facts =>
      facts.some(fact => fact.key === candidate.key && fact.fingerprint === candidate.fingerprint)
    )
  );
}

export interface ScopedFactGroup {
  scopeId: string;
  facts: ExtractedFact[];
}

export interface ScopeNode {
  id: string;
  parent_id: string | null;
  scope_type?: string | null;
}

function contentFingerprint(fact: ExtractedFact): string {
  return `${normalizeFactKey(fact.key)}:${stableJson(fact.value)}`;
}

function ancestorChain(
  scopeId: string,
  parentById: Map<string, string | null>,
  boundaryScopeId: string
): string[] {
  const chain: string[] = [];
  const visited = new Set<string>();
  let currentId: string | null = scopeId;
  while (currentId) {
    if (visited.has(currentId)) throw new Error('Scope hierarchy contains a cycle');
    visited.add(currentId);
    chain.push(currentId);
    if (currentId === boundaryScopeId) break;
    currentId = parentById.get(currentId) ?? null;
  }
  if (!chain.includes(boundaryScopeId)) {
    throw new Error(`El hecho del alcance ${scopeId} no pertenece a la corrida ${boundaryScopeId}`);
  }
  return chain;
}

function lowestCommonAncestor(
  scopeIds: string[],
  parentById: Map<string, string | null>,
  boundaryScopeId: string
): string {
  const chains = scopeIds.map(scopeId => ancestorChain(scopeId, parentById, boundaryScopeId));
  return chains[0].find(scopeId => chains.every(chain => chain.includes(scopeId)))
    || boundaryScopeId;
}

/**
 * Un hecho solo sube al ancestro cuando el material lo dice de todos sus hijos
 * vendibles, o cuando lo dice del ancestro mismo.
 *
 * Que dos hermanos coincidan no basta. Si Aura y Vento traen "cochera techada
 * para 2 autos" y de Solara el material no dice nada sobre la cochera, subirlo
 * al desarrollo hace que Solara herede una cochera que su material nunca le
 * atribuyo. Un hermano que contradice se defiende solo, porque su valor propio
 * gana al resolver; el que calla, no. Ante la duda cada hermano conserva lo
 * suyo: repetir un dato es barato, afirmar lo que el material no dice no.
 */
function ancestorCoversEveryChild(
  ancestorId: string,
  sourceScopeIds: string[],
  scopes: ScopeNode[],
  parentById: Map<string, string | null>,
  boundaryScopeId: string
): boolean {
  if (sourceScopeIds.includes(ancestorId)) return true;

  const sellableChildren = scopes
    .filter(scope => scope.parent_id === ancestorId && isSellableScopeType(scope.scope_type))
    .map(scope => scope.id);
  if (sellableChildren.length === 0) return true;

  const covered = new Set(sourceScopeIds.map(scopeId => {
    const chain = ancestorChain(scopeId, parentById, boundaryScopeId);
    const position = chain.indexOf(ancestorId);
    return position > 0 ? chain[position - 1] : ancestorId;
  }));

  return sellableChildren.every(childId => covered.has(childId));
}

/**
 * Decide donde vive cada respuesta desde la atribucion de sus hechos.
 *
 * Valores distintos permanecen en cada alcance. El mismo hecho repetido en
 * todos los hijos se escribe una sola vez en su ancestro comun. Se ignora
 * `subject` al reconocer ese caso porque justamente cambia entre los hijos aun
 * cuando el dato compartido sea identico.
 */
export function groupFactsByDestination(
  facts: ExtractedFact[],
  runScopeId: string,
  scopes: ScopeNode[]
): ScopedFactGroup[] {
  const parentById = new Map(scopes.map(scope => [scope.id, scope.parent_id]));
  const byContent = new Map<string, ExtractedFact[]>();
  for (const fact of facts) {
    const rows = byContent.get(contentFingerprint(fact)) || [];
    rows.push(fact);
    byContent.set(contentFingerprint(fact), rows);
  }

  const groups = new Map<string, Map<string, ExtractedFact>>();
  const place = (destinationId: string, rows: ExtractedFact[]) => {
    const destinationFacts = groups.get(destinationId) || new Map<string, ExtractedFact>();
    for (const fact of rows) {
      // Al subir un hecho compartido llega una copia por hermano. Se conserva
      // una sola: de otro modo el redactor recibe el mismo dato repetido y lo
      // escribe repetido.
      const key = destinationId === fact.scopeId
        ? (fact.id || fact.fingerprint)
        : contentFingerprint(fact);
      if (!destinationFacts.has(key)) destinationFacts.set(key, fact);
    }
    groups.set(destinationId, destinationFacts);
  };

  for (const matchingFacts of Array.from(byContent.values())) {
    const sourceScopeIds = Array.from(new Set(matchingFacts.map(fact => fact.scopeId)));
    if (sourceScopeIds.length === 1) {
      place(sourceScopeIds[0], matchingFacts);
      continue;
    }

    const ancestorId = lowestCommonAncestor(sourceScopeIds, parentById, runScopeId);
    if (ancestorCoversEveryChild(ancestorId, sourceScopeIds, scopes, parentById, runScopeId)) {
      place(ancestorId, matchingFacts);
      continue;
    }

    for (const fact of matchingFacts) place(fact.scopeId, [fact]);
  }

  return Array.from(groups.entries()).map(([scopeId, rows]) => ({
    scopeId,
    facts: Array.from(rows.values()),
  }));
}
