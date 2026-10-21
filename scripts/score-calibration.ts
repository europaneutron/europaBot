/**
 * Precisión y cobertura de los temas claros contra el etiquetado a mano (conversacion-con-ia, tarea 8.3).
 *
 * Lee la hoja de 100 con `etiqueta_temas` llena ("tema1;tema2"; vacío significa que la frase no
 * tiene ningún tema; "?" omite la fila) y compara, por tema y en total:
 *   - el clasificador, solo con los temas de claridad "clara" (los que alimentarían el score);
 *   - el matcher, con todos sus temas.
 * Precisión = aciertos / temas marcados. Cobertura = aciertos / temas etiquetados.
 * Escribe el resumen en el cambio para que quede como evidencia.
 *
 *   npx tsx scripts/score-calibration.ts [hoja.csv] [salida.md]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseCsv } from './helpers/csv';

const DEFAULT_INPUT = 'scripts/fixtures/calibracion-100.csv';
const DEFAULT_OUTPUT = 'openspec/changes/conversacion-con-ia/evidencia/calibracion-resultado.md';
const THRESHOLD = 0.9;

interface Counts { hits: number; marked: number; labeled: number }
const empty = (): Counts => ({ hits: 0, marked: 0, labeled: 0 });

const split = (cell: string) => cell.split(';').map(item => item.trim().toLowerCase()).filter(Boolean);
const classifierTopics = (cell: string, clarity: 'clara' | 'any') => split(cell).map(item => {
  const [topic, level] = item.split(':');
  return { topic, level: level || 'clara' };
}).filter(item => clarity === 'any' || item.level === 'clara').map(item => item.topic);

const ratio = (numerator: number, denominator: number) => denominator ? numerator / denominator : null;
const percent = (value: number | null) => value === null ? 'n/a' : `${(value * 100).toFixed(0)}%`;

export interface ScoreResult {
  rows: number;
  skipped: number;
  labeledNonEmpty: number;
  topics: string[];
  classifier: Map<string, Counts>;
  matcher: Map<string, Counts>;
  classifierAny: Map<string, Counts>;
  unknownLabels: string[];
}

export function score(csvText: string): ScoreResult {
  const [header, ...body] = parseCsv(csvText);
  const column = (name: string) => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`Falta la columna ${name}`);
    return index;
  };
  const [classifierColumn, matcherColumn, labelColumn] = ['clasificador_temas', 'matcher_temas', 'etiqueta_temas'].map(column);
  const known = new Set<string>();
  for (const row of body) {
    for (const topic of classifierTopics(row[classifierColumn] ?? '', 'any')) known.add(topic);
    for (const topic of split(row[matcherColumn] ?? '')) known.add(topic);
  }
  const result: ScoreResult = {
    rows: 0, skipped: 0, labeledNonEmpty: 0, topics: [], unknownLabels: [],
    classifier: new Map(), matcher: new Map(), classifierAny: new Map(),
  };
  const bump = (map: Map<string, Counts>, topic: string) => {
    if (!map.has(topic)) map.set(topic, empty());
    return map.get(topic)!;
  };
  const labelTopics = new Set<string>();
  for (const row of body) {
    const rawLabel = (row[labelColumn] ?? '').trim();
    if (rawLabel === '?') { result.skipped++; continue; }
    result.rows++;
    const labels = split(rawLabel);
    if (labels.length) result.labeledNonEmpty++;
    for (const label of labels) {
      labelTopics.add(label);
      if (!known.has(label)) result.unknownLabels.push(label);
    }
    const compare = (map: Map<string, Counts>, predicted: string[]) => {
      const marked = new Set(predicted);
      for (const topic of Array.from(marked)) { const counts = bump(map, topic); counts.marked++; if (labels.includes(topic)) counts.hits++; }
      for (const topic of labels) bump(map, topic).labeled++;
    };
    compare(result.classifier, classifierTopics(row[classifierColumn] ?? '', 'clara'));
    compare(result.classifierAny, classifierTopics(row[classifierColumn] ?? '', 'any'));
    compare(result.matcher, split(row[matcherColumn] ?? ''));
  }
  result.topics = Array.from(new Set([...Array.from(known), ...Array.from(labelTopics)])).sort();
  result.unknownLabels = Array.from(new Set(result.unknownLabels));
  return result;
}

function total(map: Map<string, Counts>): Counts {
  const sum = empty();
  for (const counts of Array.from(map.values())) { sum.hits += counts.hits; sum.marked += counts.marked; sum.labeled += counts.labeled; }
  return sum;
}

export function render(result: ScoreResult, source: string): string {
  const row = (name: string, a: Counts, b: Counts) =>
    `| ${name} | ${percent(ratio(a.hits, a.marked))} (${a.hits}/${a.marked}) | ${percent(ratio(a.hits, a.labeled))} (${a.hits}/${a.labeled}) | ${percent(ratio(b.hits, b.marked))} (${b.hits}/${b.marked}) | ${percent(ratio(b.hits, b.labeled))} (${b.hits}/${b.labeled}) |`;
  const lines = [
    '# Calibración: resultado contra el etiquetado a mano',
    '',
    `Hoja: \`${source}\`. Filas comparadas: ${result.rows}${result.skipped ? ` (${result.skipped} omitidas con "?")` : ''}; con algún tema etiquetado: ${result.labeledNonEmpty}.`,
    '',
    'Precisión = temas marcados que coinciden con la etiqueta / temas marcados. Cobertura = temas marcados que coinciden / temas etiquetados.',
    'El clasificador cuenta solo los temas de claridad "clara"; el matcher, todos los suyos.',
    '',
    '| Tema | Clasificador: precisión | Clasificador: cobertura | Matcher: precisión | Matcher: cobertura |',
    '|---|---|---|---|---|',
    ...result.topics.map(topic => row(topic, result.classifier.get(topic) ?? empty(), result.matcher.get(topic) ?? empty())),
    row('**Total**', total(result.classifier), total(result.matcher)),
    '',
  ];
  const classifierTotal = total(result.classifier);
  const matcherTotal = total(result.matcher);
  const anyTotal = total(result.classifierAny);
  const classifierPrecision = ratio(classifierTotal.hits, classifierTotal.marked);
  lines.push(`Referencia: el clasificador con claros y dudosos juntos tiene precisión ${percent(ratio(anyTotal.hits, anyTotal.marked))} y cobertura ${percent(ratio(anyTotal.hits, anyTotal.labeled))}.`, '');
  if (classifierPrecision === null) lines.push('Umbral: no hay temas claros marcados que medir.');
  else lines.push(`Umbral de precisión de temas claros: ${percent(THRESHOLD)}. Clasificador: ${percent(classifierPrecision)}, ${classifierPrecision >= THRESHOLD ? 'alcanza el umbral (puede evaluarse cambiar la fuente del score, tarea 8.4)' : 'no alcanza el umbral (el score sigue con el matcher y se itera la descripción de los temas)'}.`);
  lines.push(`Matcher, como referencia: precisión ${percent(ratio(matcherTotal.hits, matcherTotal.marked))}.`, '');
  if (result.rows > 0 && result.labeledNonEmpty === 0) lines.push('Advertencia: ninguna fila tiene etiqueta. Si la hoja no se etiquetó todavía, estos números no significan nada (vacío se lee como "sin tema").', '');
  if (result.unknownLabels.length) lines.push(`Advertencia: etiquetas que ningún detector produjo en la hoja (posible error de captura): ${result.unknownLabels.join(', ')}.`, '');
  return lines.join('\n');
}

if (require.main === module) {
  const input = process.argv[2] ?? DEFAULT_INPUT;
  const output = process.argv[3] ?? DEFAULT_OUTPUT;
  const markdown = render(score(readFileSync(input, 'utf8')), input);
  console.log(markdown);
  writeFileSync(output, markdown);
  console.log(`Resumen escrito en ${output}`);
}
