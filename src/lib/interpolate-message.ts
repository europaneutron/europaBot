// El material esta en espanol y el compilador nombra sus claves en el idioma
// del documento: `ubicación`, `baños_completos`, `medio_baño`. Con un patron
// solo-ASCII esos huecos no se reconocian como variables, asi que la propuesta
// declaraba `ubicación` y el texto no tenia ninguna variable detectable: se
// bloqueaba por "la declaracion de huecos no coincide". Se reconocen con
// acentos y se comparan sin ellos, para que `{ubicación}` y `{ubicacion}`
// nombren el mismo dato.
const VARIABLE_PATTERN = /\{([0-9A-Za-z_\u00C0-\u024F]+)\}/g;

export function normalizeVariableKey(key: string): string {
  return key
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
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

export function interpolateMessage(
  template: string,
  variables: MessageVariables = {}
): InterpolationResult<string> {
  const normalizedVariables = normalizeVariables(variables);
  const keys = extractVariableKeys(template);
  const missingKeys = keys.filter(key => (
    normalizedVariables[key] === null || normalizedVariables[key] === undefined
  ));
  const value = template.replace(VARIABLE_PATTERN, (match, key: string) => {
    const value = normalizedVariables[normalizeVariableKey(key)];
    return value === null || value === undefined ? match : String(value);
  });

  return {
    value,
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
