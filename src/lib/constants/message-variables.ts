/**
 * Que variables recibe cada mensaje configurable.
 *
 * La descripción de un mensaje decía que aceptaba `{alcances}` y el código no
 * se lo pasaba: quien lo escribía siguiendo la ayuda veía "{alcances}" en el
 * mensaje que recibía el lead. La lista vive aquí, junto a la pantalla que la
 * enseña, y quien añada un mensaje nuevo la actualiza aquí mismo.
 */

/** Las del negocio, disponibles en todos los mensajes sin excepción. */
export const BRAND_VARIABLES = [
  '{business_name}',
  '{project_singular}',
  '{project_plural}',
  '{project_singular_title}',
  '{project_plural_title}',
] as const;

/**
 * La escena en la que sale cada mensaje: qué escribió el lead, con qué se
 * rellenan sus variables y qué botones lleva detrás. Es lo que hace que quien
 * escribe vea el momento en vez de reconstruirlo desde la etiqueta del campo.
 */
export interface MessageScene {
  lead: string;
  variables: (names: string[]) => Record<string, string>;
  buttons: (names: string[]) => string[];
  before?: string;
}

/** Lo que recibe cada mensaje además de las del negocio. */
export const MESSAGE_VARIABLES: Record<string, { vars: string[]; hint: string; scene?: MessageScene }> = {
  scope_presentation_message: {
    vars: ['{alcances}'],
    hint: 'Solo sale si apagas el saludo automático, arriba en "El negocio".',
    scene: {
      lead: 'hola',
      variables: (names: string[]) => ({ alcances: names.join('\n') }),
      buttons: () => [],
    },
  },
  scope_catalog_summary_message: {
    vars: ['{opciones}'],
    hint: 'Cada opción trae su nombre y, si el catálogo lo tiene, su precio.',
    scene: {
      lead: '¿cuánto cuestan?',
      variables: (names: string[]) => ({ opciones: names.map((name, index) => `${name} · $${700 + index * 150}K`).join('; ') }),
      buttons: (names: string[]) => names,
    },
  },
  scope_disambiguation_message: {
    vars: ['{alcances}'],
    hint: 'Detrás van los botones, así que termina en la pregunta.',
    scene: {
      lead: '¿qué medidas tienen los lotes?',
      variables: (names: string[]) => ({ alcances: names.join(' y ') }),
      buttons: (names: string[]) => names,
    },
  },
  scope_disambiguation_followup_message: {
    vars: [],
    hint: 'Va después de un texto que ya adelantó algo: puede ser muy corto.',
    scene: {
      lead: '¿cuánto cuestan?',
      variables: () => ({}),
      buttons: (names: string[]) => names,
      before: 'Te comparto lo que tenemos disponible\n\nEuropa · $700K; Malasia · $850K',
    },
  },
  scope_next_level_message: {
    vars: ['{alcance}'],
    hint: '{alcance} es el que el lead acaba de nombrar.',
    scene: {
      lead: 'Europa',
      variables: (names: string[]) => ({ alcance: names[0] || 'Europa' }),
      buttons: () => ['Modelo Aura', 'Modelo Vento'],
    },
  },
  scope_only_presentation_message: {
    vars: ['{alcance}'],
    hint: '{alcance} es el que el lead acaba de nombrar.',
    scene: {
      lead: 'Europa',
      variables: (names: string[]) => ({ alcance: names[0] || 'Europa' }),
      buttons: () => [],
    },
  },
  sibling_message: {
    vars: [],
    hint: 'Detrás van los botones con las otras opciones.',
    scene: { lead: '¿y el otro?', variables: () => ({}), buttons: (names: string[]) => names.slice(1) },
  },
  sibling_up_message: {
    vars: [],
    hint: 'Detrás van los botones con lo que sí hay.',
    scene: { lead: '¿y los demás?', variables: () => ({}), buttons: (names: string[]) => names },
  },
  sibling_none_message: {
    vars: [],
    hint: 'No lleva botones: no queda nada que ofrecer.',
    scene: { lead: '¿qué más tienen?', variables: () => ({}), buttons: () => [] },
  },
  unanchored_affirmative_message: {
    vars: [],
    hint: 'Detrás van los botones con las opciones.',
    scene: { lead: 'sí', variables: () => ({}), buttons: (names: string[]) => names },
  },
  pending_offer_repeat_message: {
    vars: [],
    hint: 'Detrás se repiten los mismos botones.',
    scene: { lead: 'sí', variables: () => ({}), buttons: (names: string[]) => names },
  },
  offer_appointment_label: {
    vars: [],
    hint: 'Es el texto de un botón: máximo 20 caracteres.',
  },
};
