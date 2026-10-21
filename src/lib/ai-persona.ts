/**
 * Reglas de la persona del asistente que comparten el panel y el servidor:
 * las opciones válidas, el límite de las notas y el aviso de prohibiciones.
 * Sin dependencias de servidor para poder importarse desde componentes.
 */

export const PERSONA_NOTES_MAX_LENGTH = 600;
export const PERSONA_NAME_MAX_LENGTH = 60;

export const PERSONA_REGISTERS = ['tu', 'usted'] as const;
export const PERSONA_EMOJIS = ['si', 'pocos', 'no'] as const;
export const PERSONA_LENGTHS = ['corta', 'media'] as const;

export interface PersonaFields {
  name: string;
  register: (typeof PERSONA_REGISTERS)[number];
  emojis: (typeof PERSONA_EMOJIS)[number];
  length: (typeof PERSONA_LENGTHS)[number];
  notes: string;
}

export const PERSONA_CONFIG_KEYS = {
  name: 'ai_persona_name',
  register: 'ai_persona_register',
  emojis: 'ai_persona_emojis',
  length: 'ai_persona_length',
  notes: 'ai_persona_notes',
} as const;

const PROHIBITION_WORDS = /\b(nunca|jamas|prohibid[oa]s?)\b/g;

/**
 * Palabras de prohibición en las notas, sin distinguir mayúsculas ni acentos.
 * Es un aviso, no un bloqueo: una prohibición tiende a provocar lo que prohíbe.
 */
export function findPersonaProhibitions(notes: string): string[] {
  const normalized = notes.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return Array.from(new Set(normalized.match(PROHIBITION_WORDS) ?? []));
}

/** Convierte los campos del formulario en el mapa que consume `buildPersona`. */
export function personaToConfig(fields: PersonaFields): Record<string, string> {
  return {
    [PERSONA_CONFIG_KEYS.name]: fields.name,
    [PERSONA_CONFIG_KEYS.register]: fields.register,
    [PERSONA_CONFIG_KEYS.emojis]: fields.emojis,
    [PERSONA_CONFIG_KEYS.length]: fields.length,
    [PERSONA_CONFIG_KEYS.notes]: fields.notes,
  };
}
