/**
 * Hoja de calibración del clasificador de temas (conversacion-con-ia, tarea 8.1).
 *
 * Toma 300 frases reales del fixture con semilla fija, estratificadas para que los saludos no
 * dominen la muestra, y corre sobre cada una el clasificador (sin historial, API real) y el
 * matcher léxico. Escribe dos hojas fuera de git:
 *   scripts/fixtures/calibracion-300.csv  las 300, para ver huecos de contenido
 *   scripts/fixtures/calibracion-100.csv  100 equilibradas por tema, para etiquetar a mano
 *
 * Solo lee la base local (temas y alcances); no escribe nada. Las llamadas al modelo no se
 * registran en `ai_model_calls`.
 *
 *   npx tsx scripts/calibrate-classifier.ts                 (muestra nueva)
 *   npx tsx scripts/calibrate-classifier.ts --reclasificar  (misma hoja etiquetada)
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { assertLocalSupabase } from './helpers/fymsa-fixture';
import { parseCsv, toCsv } from './helpers/csv';

config({ quiet: true, path: resolve(process.cwd(), '.env.development.local') });
config({ quiet: true, path: resolve(process.cwd(), '.env.local') });

const FIXTURE = 'scripts/fixtures/frases-reales.json';
const SEED = 20261021;
const CSV_HEADER = ['id', 'frase', 'clasificador_temas', 'clasificador_otro', 'matcher_temas', 'etiqueta_temas', 'notas'];

/** Estratos por palabras: del más específico al más general; una frase cae en el primero que coincida. */
const STRATA: Array<{ name: string; quota: number; pattern: RegExp }> = [
  { name: 'fecha_visita', quota: 25, pattern: /\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo|manana|hoy|fin de semana|visitar|visita|agendar|cita|conocer|ir a ver|pasar a)\b/ },
  { name: 'mensualidad_enganche', quota: 30, pattern: /\b(mensualidad|mensualidades|mensual|enganche|pago|pagos|plazo|plazos|mensualidad|abono|apartado|mensualmente|meses)\b/ },
  { name: 'credito', quota: 35, pattern: /\b(infonavit|fovissste|credito|creditos|financiamiento|hipotec\w*|banco|bancario|cofinavit|pension\w*)\b/ },
  { name: 'brochure', quota: 25, pattern: /\b(brochure|folleto|catalogo|pdf|fotos?|imagenes|video|planos?|informacion|info|mas informes|informes)\b/ },
  { name: 'promociones', quota: 25, pattern: /\b(promocion|promociones|descuento|descuentos|oferta|ofertas|bono|regalo|contado)\b/ },
  { name: 'amenidades', quota: 25, pattern: /\b(amenidades|alberca|casa club|areas verdes|seguridad|vigilancia|parque|gimnasio|servicios|caseta)\b/ },
  { name: 'disponibilidad', quota: 25, pattern: /\b(disponible|disponibles|disponibilidad|quedan|hay lotes|hay casas|existe|vendido|vendidos|entrega|entregan|inmediata|m2|metros|medidas|recamaras?)\b/ },
  { name: 'ubicacion', quota: 30, pattern: /\b(ubicacion|ubicados|ubicado|donde|direccion|queda|mapa|cerca|zona|colonia|ciudad|villahermosa)\b/ },
  { name: 'precio', quota: 35, pattern: /\b(precio|precios|costo|costos|cuesta|cuestan|vale|valen|cotizacion|cuanto|lista de precios|desde)\b/ },
  { name: 'saludo', quota: 15, pattern: /^(hola|buenas?|buen dia|buenos dias|buenas tardes|buenas noches|saludos|hi|hey)\b.{0,20}$/ },
];
const NOISE_QUOTA = 30;

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Descarta lo que no es una frase de un lead: vacío, demasiado largo (spam, plantillas) o solo signos. */
function usable(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length >= 3 && trimmed.length <= 160 && /[a-záéíóúñ]/i.test(trimmed);
}

function stratifiedSample(phrases: string[]): Array<{ phrase: string; stratum: string }> {
  const random = mulberry32(SEED);
  const pool = shuffle(Array.from(new Set(phrases.filter(usable))), random);
  const taken = new Set<string>();
  const picked: Array<{ phrase: string; stratum: string }> = [];
  const byStratum = new Map<string, string[]>();
  for (const phrase of pool) {
    const text = plain(phrase);
    const stratum = STRATA.find(item => item.pattern.test(text))?.name ?? 'ruido';
    byStratum.set(stratum, [...(byStratum.get(stratum) ?? []), phrase]);
  }
  const quotas = [...STRATA.map(item => ({ name: item.name, quota: item.quota })), { name: 'ruido', quota: NOISE_QUOTA }];
  for (const { name, quota } of quotas) {
    for (const phrase of (byStratum.get(name) ?? []).slice(0, quota)) { picked.push({ phrase, stratum: name }); taken.add(phrase); }
  }
  // Si un estrato no alcanzó su cuota, se completa con lo que sobre para llegar a 300.
  const total = quotas.reduce((sum, item) => sum + item.quota, 0);
  for (const phrase of pool) {
    if (picked.length >= total) break;
    if (!taken.has(phrase)) { picked.push({ phrase, stratum: 'relleno' }); taken.add(phrase); }
  }
  return shuffle(picked, random);
}

interface Row {
  id: string;
  stratum: string;
  phrase: string;
  classifier: Array<{ topic: string; clarity: string }>;
  classifierOther: string;
  classifierFailure: string | null;
  matcher: string[];
}

async function mapLimit<T, R>(items: T[], limit: number, work: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index], index);
    }
  }));
  return results;
}

const topicsText = (row: Row) => row.classifier.map(item => `${item.topic}:${item.clarity}`).join(';');

/** 100 filas equilibradas: ~9 por tema (mitad clara, mitad lo que el clasificador o el matcher marcan distinto) y el resto sin tema. */
function pickLabelingSubset(rows: Row[], topics: string[]): Row[] {
  const random = mulberry32(SEED + 1);
  const chosen = new Map<string, Row>();
  const perTopic = Math.floor(70 / topics.length);
  for (const topic of topics) {
    const withTopic = rows.filter(row => !chosen.has(row.id)
      && (row.classifier.some(item => item.topic === topic) || row.matcher.includes(topic)));
    const clear = shuffle(withTopic.filter(row => row.classifier.some(item => item.topic === topic && item.clarity === 'clara') && row.matcher.includes(topic)), random);
    const contested = shuffle(withTopic.filter(row => !clear.includes(row)), random);
    const take = [...clear.slice(0, Math.ceil(perTopic / 2)), ...contested].slice(0, perTopic);
    // Si hay pocos discutidos, se completa con claros para que cada tema pese lo mismo.
    for (const row of [...take, ...clear.slice(Math.ceil(perTopic / 2))].slice(0, perTopic)) chosen.set(row.id, row);
  }
  const none = shuffle(rows.filter(row => !chosen.has(row.id) && !row.classifier.length && !row.matcher.length), random);
  const other = shuffle(rows.filter(row => !chosen.has(row.id) && !row.classifier.length && row.classifierOther), random);
  const rest = shuffle(rows.filter(row => !chosen.has(row.id)), random);
  for (const row of [...other.slice(0, 12), ...none, ...rest]) {
    if (chosen.size >= 100) break;
    chosen.set(row.id, row);
  }
  return shuffle(Array.from(chosen.values()), random);
}

async function main() {
  assertLocalSupabase();
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Falta ANTHROPIC_API_KEY en .env.development.local');
  const [
    { classifyTopics }, { loadClassifierConfig, createResponderClient }, { intentConfigRepository },
    { ROOT_SCOPE_ID, scopeRepository }, { intentDetectionService }, { supabaseServer }, { buildAiContext },
  ] = await Promise.all([
    import('../src/core/ai-conversation/topic-classifier'), import('../src/services/anthropic/client'),
    import('../src/data/repositories/intent-config.repository'), import('../src/data/repositories/scope.repository'),
    import('../src/core/intent-engine'), import('../src/services/supabase/server-client'),
    import('../src/core/ai-conversation/context-builder'),
  ]);

  const sample = stratifiedSample(JSON.parse(readFileSync(FIXTURE, 'utf8')) as string[]);
  const counts = new Map<string, number>();
  for (const item of sample) counts.set(item.stratum, (counts.get(item.stratum) ?? 0) + 1);
  console.log(`Muestra: ${sample.length} frases. Estratos: ${Array.from(counts).map(([name, count]) => `${name}=${count}`).join(', ')}`);

  const classifierConfig = await loadClassifierConfig();
  const topicRows = await intentConfigRepository.listActiveCheckpointTopics();
  const topics = topicRows.map(row => ({
    name: row.intent_name, description: row.display_name,
    examples: (row.phrases.length ? row.phrases : row.keywords).map(text => text.replace(/^[¿]+|[?]+$/g, '').trim()).filter(Boolean),
  }));
  const developments = (await buildAiContext()).developments.map(item => ({ id: item.id, name: item.name }));
  const reachable = Array.from(await scopeRepository.getReachableScopeIds());
  const client = createResponderClient();

  // Tras cambiar el prompt del clasificador se mide otra vez contra la misma hoja
  // etiquetada: se reescriben solo las columnas del clasificador, nunca la etiqueta.
  if (process.argv.includes('--reclasificar')) {
    const sheet = 'scripts/fixtures/calibracion-100.csv';
    const [header, ...body] = parseCsv(readFileSync(sheet, 'utf8').replace(/^﻿/, ''));
    const col = (name: string) => header.indexOf(name);
    const updated = await mapLimit(body.filter(cells => cells.length > 1), 6, async cells => {
      const input = { userId: 'calibracion', messageId: `recalibracion-${cells[col('id')]}`, message: cells[col('frase')], priorTurns: [], topics, developments, config: classifierConfig };
      let output = await classifyTopics(input, { client, log: async () => {} });
      if (output.failureReason) output = await classifyTopics(input, { client, log: async () => {} });
      const next = [...cells];
      next[col('clasificador_temas')] = output.topics.map(item => `${item.intent_name}:${item.clarity}`).join(';');
      next[col('clasificador_otro')] = output.failureReason ? `[fallo:${output.failureReason}]` : output.otherTopic ?? '';
      return next;
    });
    writeFileSync(sheet, toCsv(header, updated));
    console.log(`Reclasificadas ${updated.length} filas de ${sheet}; las etiquetas no cambiaron.`);
    return;
  }

  const rows = await mapLimit(sample, 6, async ({ phrase, stratum }, index): Promise<Row> => {
    const id = String(index + 1).padStart(3, '0');
    let output = await classifyTopics({ userId: 'calibracion', messageId: `calibracion-${id}`, message: phrase, priorTurns: [], topics, developments, config: classifierConfig },
      { client, log: async () => {} });
    // Un fallo transitorio (límite de tasa, tiempo) se reintenta una vez; el resultado final se conserva con su causa.
    if (output.failureReason) {
      output = await classifyTopics({ userId: 'calibracion', messageId: `calibracion-${id}`, message: phrase, priorTurns: [], topics, developments, config: classifierConfig },
        { client, log: async () => {} });
    }
    const detection = await intentDetectionService.detectAcrossScopes(phrase, supabaseServer, reachable.length ? reachable : [ROOT_SCOPE_ID]);
    const matcher = Array.from(new Set(detection.all_matches.filter(match => match.is_checkpoint).map(match => match.intent_name)));
    return {
      id, stratum, phrase,
      classifier: output.topics.map(item => ({ topic: item.intent_name, clarity: item.clarity })),
      classifierOther: output.otherTopic ?? '', classifierFailure: output.failureReason, matcher,
    };
  });

  const failures = rows.filter(row => row.classifierFailure);
  if (failures.length) console.log(`Fallos del clasificador tras reintento: ${failures.length} (${Array.from(new Set(failures.map(row => row.classifierFailure))).join(', ')})`);

  const toCsvRow = (row: Row) => [row.id, row.phrase, topicsText(row), row.classifierFailure ? `[fallo:${row.classifierFailure}]` : row.classifierOther, row.matcher.join(';'), '', ''];
  writeFileSync('scripts/fixtures/calibracion-300.csv', toCsv(CSV_HEADER, rows.map(toCsvRow)));
  const subset = pickLabelingSubset(rows.filter(row => !row.classifierFailure), topics.map(topic => topic.name));
  writeFileSync('scripts/fixtures/calibracion-100.csv', toCsv(CSV_HEADER, subset.map(toCsvRow)));
  console.log(`Escritas scripts/fixtures/calibracion-300.csv y calibracion-100.csv (${subset.length} filas).`);

  const subsetCount = (topic: string) => subset.filter(row => row.classifier.some(item => item.topic === topic) || row.matcher.includes(topic)).length;
  console.log('\nCobertura de la hoja de 100 por tema (clasificador o matcher lo marcan): '
    + topics.map(topic => `${topic.name}=${subsetCount(topic.name)}`).join(', ')
    + `; sin ningún tema=${subset.filter(row => !row.classifier.length && !row.matcher.length).length}`);

  const classifierMarks = rows.filter(row => row.classifier.length).length;
  const classifierClear = rows.filter(row => row.classifier.some(item => item.clarity === 'clara')).length;
  const matcherMarks = rows.filter(row => row.matcher.length).length;
  const sameSet = rows.filter(row => {
    const left = Array.from(new Set(row.classifier.map(item => item.topic))).sort().join(';');
    return left === [...row.matcher].sort().join(';');
  }).length;
  const bothMark = rows.filter(row => row.classifier.length && row.matcher.length);
  const bothSame = bothMark.filter(row => Array.from(new Set(row.classifier.map(item => item.topic))).sort().join(';') === [...row.matcher].sort().join(';')).length;
  const onlyClassifier = rows.filter(row => row.classifier.length && !row.matcher.length).length;
  const onlyMatcher = rows.filter(row => !row.classifier.length && row.matcher.length).length;
  const neither = rows.filter(row => !row.classifier.length && !row.matcher.length).length;
  const others = new Map<string, number>();
  for (const row of rows) {
    const label = row.classifierOther.trim().toLowerCase();
    if (label) others.set(label, (others.get(label) ?? 0) + 1);
  }
  // El texto libre casi nunca se repite: se agrupa por palabra para ver los huecos de contenido reales.
  const OTHER_BUCKETS: Array<[string, RegExp]> = [
    ['cita o visita', /\b(cita|visita|visitar|agendar|agenda|fecha|hora|sabado|domingo|lunes|martes|miercoles|jueves|viernes)\b/],
    ['disponibilidad', /\b(disponib|hay |existe|vendid)/],
    ['alianza, proveedor o venta de servicios', /\b(asesor|alianza|proveedor|servicios|factur|vender|comisi)/],
    ['datos personales o laborales', /\b(imss|trabaj|nomina|ingreso|empleo|nombre)/],
  ];
  const bucketCounts = new Map<string, number>();
  for (const [label, count] of Array.from(others)) {
    const bucket = OTHER_BUCKETS.find(([, pattern]) => pattern.test(plain(label)))?.[0] ?? 'otros (sin agrupar)';
    bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + count);
  }
  const topOthers = Array.from(others).sort((a, b) => b[1] - a[1]).slice(0, 20);
  const pct = (value: number) => `${value} (${Math.round((value / rows.length) * 100)}%)`;
  const perTopic = topics.map(topic => `${topic.name}: clasificador ${rows.filter(row => row.classifier.some(item => item.topic === topic.name)).length}, matcher ${rows.filter(row => row.matcher.includes(topic.name)).length}`);
  const summary = [
    '# Calibración: resumen sin etiquetar',
    '',
    `Muestra: ${rows.length} frases reales (semilla ${SEED}), sin historial. Hoja de etiquetado: ${subset.length} filas.`,
    '',
    `- El clasificador marca algún tema: ${pct(classifierMarks)}; alguno con claridad "clara": ${pct(classifierClear)}.`,
    `- El matcher marca algún tema: ${pct(matcherMarks)}.`,
    `- Ambos marcan: ${bothMark.length}; con el mismo conjunto de temas: ${bothSame} (${bothMark.length ? Math.round((bothSame / bothMark.length) * 100) : 0}% de los que ambos marcan).`,
    `- Solo el clasificador: ${onlyClassifier}. Solo el matcher: ${onlyMatcher}. Ninguno: ${neither}.`,
    `- Mismo conjunto de temas (incluye ambos vacíos): ${pct(sameSet)}.`,
    `- Fallos del clasificador tras reintento: ${failures.length}.`,
    '',
    '## Marcas por tema (de 300)',
    ...perTopic.map(line => `- ${line}`),
    '',
    '## otro_tema agrupado por palabra',
    ...Array.from(bucketCounts).sort((a, b) => b[1] - a[1]).map(([label, count]) => `- ${label}: ${count}`),
    '',
    '## Los 20 otro_tema más comunes (huecos de contenido)',
    ...(topOthers.length ? topOthers.map(([label, count]) => `- ${label}: ${count}`) : ['- (ninguno)']),
    '',
  ].join('\n');
  writeFileSync('openspec/changes/conversacion-con-ia/evidencia/calibracion-resumen-sin-etiquetas.md', summary);
  console.log('\n' + summary);
  process.exit(0);
}

main().catch(error => { console.error(error); process.exit(1); });
