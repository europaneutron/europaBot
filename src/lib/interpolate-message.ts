// El material esta en espanol y el compilador nombra sus claves en el idioma
// del documento: `ubicación`, `baños_completos`, `medio_baño`. Con un patron
// solo-ASCII esos huecos no se reconocian como variables, asi que la propuesta
// declaraba `ubicación` y el texto no tenia ninguna variable detectable: se
// bloqueaba por "la declaracion de huecos no coincide". Se reconocen con
// acentos y se comparan sin ellos, para que `{ubicación}` y `{ubicacion}`
// nombren el mismo dato.
// El punto separa el alcance del dato: `{europa.precio}` nombra el precio
// de Europa desde donde sea. Sin cualificar --`{precio}`-- el dato sale de
// donde esta la conversacion, con su herencia, que es lo normal.
const VARIABLE_PATTERN = /\{([0-9A-Za-z_.\u00C0-\u024F]+)\}/g;

export function normalizeVariableKey(key: string): string {
  return key
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Como se nombra un alcance dentro de un hueco: sin acentos, en minusculas y
 * con guion bajo donde habia espacios. "Europa Residencial" se cita como
 * `{europa_residencial.precio}`, y su alias "Europa" como `{europa.precio}`.
 */
export function qualifyScopeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export type MessageVariables = Record<string, string | number | null | undefined>;

export interface InterpolationResult<T = string> {
  value: T;
  missingKeys: string[];
  hadVariables: boolean;
  complete: boolean;
}

export function extractVariableKeys(template: string): string[] {
  return Array.from(new Set(
    Array.from(template.matchAll(VARIABLE_PATTERN), match => normalizeVariableKey(match[1]))
  ));
}

/**
 * Las claves del mapa se comparan sin acentos y en minusculas, igual que las
 * del texto: quien escribe la respuesta y quien nombra el dato no tienen por
 * que teclear el mismo acento para hablar del mismo valor.
 */
function normalizeVariables(variables: MessageVariables): MessageVariables {
  const normalized: MessageVariables = {};
  for (const [key, value] of Object.entries(variables)) {
    normalized[normalizeVariableKey(key)] = value;
  }
  return normalized;
}

/**
 * El valor del catalogo puede traer ya su unidad --"96 casas", "1 medio
 * bano"-- y la prosa repetirla detras: "{medio_bano} medio bano" se leia
 * como "1 medio bano medio bano". Quien redacta no sabe si la unidad viene
 * dentro del dato, asi que la repeticion se resuelve al renderizar y no
 * pidiendosela al modelo.
 *
 * Se compara la cola del valor contra el arranque del texto que sigue,
 * palabra por palabra, y se quita lo que coincida -- puede ser mas de una
 * palabra ("medio bano"). Solo actua pegado a un valor sustituido: una
 * repeticion que ya estaba escrita en la plantilla, como "Ya ya veremos",
 * se respeta.
 */
const SUBSTITUTION_MARK = '\u0000';
const WORD_SOURCE = '[0-9A-Za-z\\u00C0-\\u024F]+';

function collapseRepeatedUnit(text: string): string {
  // `s` para que `.` cruce saltos de linea. Sin el, un valor de varias
  // lineas --la lista de desarrollos de {alcances}-- no casaba con las marcas,
  // asi que se quedaban puestas y el lead recibia dos caracteres nulos
  // envolviendo la lista.
  const marker = new RegExp(`${SUBSTITUTION_MARK}(.*?)${SUBSTITUTION_MARK}`, 'gs');

  let result = '';
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = marker.exec(text)) !== null) {
    result += text.slice(cursor, match.index);
    const value = match[1];
    result += value;
    cursor = marker.lastIndex;

    const valueWords = value.trim().split(/\s+/).filter(Boolean);
    if (valueWords.length === 0) continue;

    // Palabras que siguen al valor, tal como estan escritas, tomadas solo
    // mientras sean contiguas al valor (sin saltar texto intermedio).
    const leadingWord = new RegExp(`\\s+${WORD_SOURCE}`, 'g');
    const followingWords: string[] = [];
    let offset = 0;
    let wordMatch: RegExpExecArray | null;
    while (
      followingWords.length < valueWords.length &&
      (wordMatch = leadingWord.exec(text.slice(cursor))) !== null
    ) {
      if (wordMatch.index !== offset) break;
      followingWords.push(wordMatch[0]);
      offset += wordMatch[0].length;
    }

    let matchedCount = 0;
    for (let k = Math.min(valueWords.length, followingWords.length); k >= 1; k--) {
      const tail = valueWords.slice(valueWords.length - k).map(w => w.toLowerCase());
      const head = followingWords.slice(0, k).map(w => w.trim().toLowerCase());
      if (tail.join(' ') === head.join(' ')) {
        matchedCount = k;
        break;
      }
    }

    if (matchedCount > 0) {
      cursor += followingWords.slice(0, matchedCount).reduce((sum, w) => sum + w.length, 0);
    }
  }

  result += text.slice(cursor);
  return result;
}

export function interpolateMessage(
  template: string,
  variables: MessageVariables = {}
): InterpolationResult<string> {
  const normalizedVariables = normalizeVariables(variables);
  const keys = extractVariableKeys(template);
  const missingKeys = keys.filter(key => (
    normalizedVariables[key] === null || normalizedVariables[key] === undefined
  ));
  const substituted = template.replace(VARIABLE_PATTERN, (match, key: string) => {
    const value = normalizedVariables[normalizeVariableKey(key)];
    return value === null || value === undefined
      ? match
      : `${SUBSTITUTION_MARK}${String(value)}${SUBSTITUTION_MARK}`;
  });

  return {
    value: collapseRepeatedUnit(substituted),
    missingKeys,
    hadVariables: keys.length > 0,
    complete: missingKeys.length === 0,
  };
}

/**
 * Normaliza un JSONB de variables guardado junto a una respuesta.
 *
 * La columna es libre y puede contener cualquier cosa; solo se aceptan valores
 * escalares, que son los únicos que tienen una representación razonable dentro
 * de un mensaje.
 */
export function toMessageVariables(value: unknown): MessageVariables {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => (
        typeof item === 'string' || typeof item === 'number' || item === null
      ))
  ) as MessageVariables;
}

export function interpolateMessageValue<T>(
  value: T,
  variables: MessageVariables = {}
): InterpolationResult<T> {
  if (typeof value === 'string') {
    return interpolateMessage(value, variables) as InterpolationResult<T>;
  }

  if (Array.isArray(value)) {
    const items = value.map(item => interpolateMessageValue(item, variables));
    const missingKeys = Array.from(new Set(items.flatMap(item => item.missingKeys)));
    return {
      value: items.map(item => item.value) as T,
      missingKeys,
      hadVariables: items.some(item => item.hadVariables),
      complete: missingKeys.length === 0,
    };
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value).map(([key, item]) => [
      key,
      interpolateMessageValue(item, variables),
    ] as const);
    const missingKeys = Array.from(new Set(entries.flatMap(([, item]) => item.missingKeys)));
    return {
      value: Object.fromEntries(entries.map(([key, item]) => [key, item.value])) as T,
      missingKeys,
      hadVariables: entries.some(([, item]) => item.hadVariables),
      complete: missingKeys.length === 0,
    };
  }

  return { value, missingKeys: [], hadVariables: false, complete: true };
}
