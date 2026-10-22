/**
 * Extrae frases reales de leads desde un respaldo local de produccion para
 * medir el camino con IA con lo que la gente escribe de verdad, no con lo que
 * se nos ocurre (tarea 2.1 de `conversacion-con-ia`).
 *
 * Conserva solo el texto de los mensajes entrantes. Descarta ids, telefonos,
 * fechas y usuarios, y enmascara en el texto lo que parezca telefono o correo:
 * un lead a veces escribe su numero dentro del mensaje. Los nombres propios no
 * se pueden detectar con seguridad por patron; por eso la tarea 2.2 revisa una
 * muestra a mano.
 *
 * No escribe en ninguna base de datos. La salida vive en
 * `scripts/fixtures/frases-reales.json`, ignorada por git igual que `backups/`.
 *
 * Uso: npx tsx scripts/extract-real-phrases.ts [ruta-del-respaldo]
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const DEFAULT_BACKUP = 'backups/prod_backup_data_20260831_173131.sql';
const OUTPUT = 'scripts/fixtures/frases-reales.json';
const TABLE_HEADER = 'INSERT INTO "public"."conversations"';

// Lee una tupla de valores SQL de pg_dump: comillas simples con '' como escape.
function parseTuple(line: string): (string | null)[] {
  const values: (string | null)[] = [];
  let index = line.indexOf('(') + 1;
  while (index < line.length) {
    const char = line[index];
    if (char === ' ' || char === ',') { index++; continue; }
    if (char === ')') break;
    if (char === "'") {
      let value = '';
      index++;
      while (index < line.length) {
        if (line[index] === "'" && line[index + 1] === "'") { value += "'"; index += 2; continue; }
        if (line[index] === "'") break;
        value += line[index++];
      }
      values.push(value);
      index++;
    } else {
      let end = index;
      while (end < line.length && line[end] !== ',' && line[end] !== ')') end++;
      const raw = line.slice(index, end).trim();
      values.push(raw === 'NULL' ? null : raw);
      index = end;
    }
  }
  return values;
}

function maskPersonalData(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[correo]')
    .replace(/\+?\d[\d\s-]{8,}\d/g, '[telefono]')
    .replace(/\b(me llamo|mi nombre es|soy)\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñ]*(\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñ]*){0,3}/gi,
      (_match, intro: string) => `${intro} [nombre]`);
}

// La captura del asesor pide "tu nombre completo", y el lead contesta solo con
// su nombre. Esos mensajes no dicen nada del interes del lead y si identifican
// a una persona: se descartan enteros en lugar de enmascararse.
const COMMON_WORDS = /\b(hola|gracias|precio|casa|lote|info|buenas|tardes|dias|días|noches|quiero|ok|si|sí|donde|cuanto|cuánto|me|el|la|de|en|que|por)\b/i;
// El nombre llega con mayuscula inicial ("Juan Perez") o, a veces, en minusculas
// con puntos o comas entre palabras ("armando. humberto. ..."). Sin esa
// puntuacion, dos palabras en minusculas suelen ser una pregunta ("con
// infonavit"), no un nombre: solo se aceptan en minusculas si venian separadas.
function looksLikeBareName(text: string): boolean {
  const separated = /[a-záéíóúñ][.,;]\s*[a-záéíóúñ]/i.test(text);
  const words = text.replace(/[.,;]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (COMMON_WORDS.test(words)) return false;
  const capitalized = /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+( [A-ZÁÉÍÓÚÑa-záéíóúñ][a-záéíóúñ]+){1,4}$/.test(words);
  const lowercaseSeparated = separated && /^[a-záéíóúñ]+( [a-záéíóúñ]+){1,4}$/i.test(words);
  return capitalized || lowercaseSeparated;
}

function main() {
  const backupPath = resolve(process.cwd(), process.argv[2] ?? DEFAULT_BACKUP);
  const lines = readFileSync(backupPath, 'utf8').split('\n');
  const start = lines.findIndex(line => line.startsWith(TABLE_HEADER));
  if (start < 0) throw new Error(`El respaldo no trae la tabla de conversaciones: ${backupPath}`);

  const columns = lines[start]
    .slice(lines[start].indexOf('(') + 1, lines[start].indexOf(')'))
    .split(',')
    .map(column => column.trim().replace(/"/g, ''));
  const textIndex = columns.indexOf('message_text');
  const directionIndex = columns.indexOf('direction');
  const typeIndex = columns.indexOf('message_type');
  const messageIdIndex = columns.indexOf('message_id');

  const phrases = new Set<string>();
  let read = 0;
  let droppedNames = 0;
  // Un mensaje con saltos de linea ocupa varias lineas del respaldo: se
  // acumulan hasta que la tupla cierra.
  let pending = '';
  for (let i = start + 1; i < lines.length; i++) {
    pending = pending ? `${pending}\n${lines[i]}` : lines[i];
    const trimmed = pending.trimEnd();
    if (!trimmed.endsWith('),') && !trimmed.endsWith(');')) continue;
    const isLast = trimmed.endsWith(');');
    const values = parseTuple(trimmed.trim());
    pending = '';
    read++;
    const text = values[textIndex];
    const isLead = values[directionIndex] === 'inbound' && (values[typeIndex] ?? 'text') === 'text';
    // Los mensajes de prueba del equipo llevan ids `test_`: no son leads.
    const isTest = (values[messageIdIndex] ?? '').startsWith('test_');
    if (isLead && !isTest && text) {
      const normalized = text.replace(/\s+/g, ' ').trim();
      if (looksLikeBareName(normalized)) { droppedNames++; if (isLast) break; continue; }
      const clean = maskPersonalData(normalized);
      if (clean.length >= 2) phrases.add(clean);
    }
    if (isLast) break;
  }

  const output = Array.from(phrases).sort((a, b) => a.localeCompare(b, 'es'));
  writeFileSync(resolve(process.cwd(), OUTPUT), `${JSON.stringify(output, null, 1)}\n`);
  const masked = output.filter(phrase => /\[(telefono|correo|nombre)\]/.test(phrase)).length;
  console.log(`Filas leidas: ${read}. Frases unicas de leads: ${output.length}. Con datos enmascarados: ${masked}. Nombres sueltos descartados: ${droppedNames}.`);
  console.log(`Salida: ${OUTPUT}`);
}

main();
