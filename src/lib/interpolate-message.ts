const VARIABLE_PATTERN = /\{([a-zA-Z0-9_]+)\}/g;

export type MessageVariables = Record<string, string | number | null | undefined>;

export function interpolateMessage(template: string, variables: MessageVariables = {}): string {
  return template.replace(VARIABLE_PATTERN, (_match, key: string) => {
    const value = variables[key];
    return value === null || value === undefined ? '' : String(value);
  });
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

export function interpolateMessageValue<T>(value: T, variables: MessageVariables = {}): T {
  if (typeof value === 'string') {
    return interpolateMessage(value, variables) as T;
  }

  if (Array.isArray(value)) {
    return value.map(item => interpolateMessageValue(item, variables)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, interpolateMessageValue(item, variables)])
    ) as T;
  }

  return value;
}
