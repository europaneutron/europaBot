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

/** Lo que recibe cada mensaje además de las del negocio. */
export const MESSAGE_VARIABLES: Record<string, { vars: string[]; hint: string }> = {
  scope_presentation_message: {
    vars: ['{alcances}'],
    hint: 'Solo sale si apagas el saludo compuesto en Configurar bot.',
  },
  scope_catalog_summary_message: {
    vars: ['{opciones}'],
    hint: 'Cada opción trae su nombre y, si el catálogo lo tiene, su precio.',
  },
  scope_disambiguation_message: {
    vars: ['{alcances}'],
    hint: 'Detrás van los botones, así que termina en la pregunta.',
  },
  scope_disambiguation_followup_message: {
    vars: [],
    hint: 'Va después de un texto que ya adelantó algo: puede ser muy corto.',
  },
  scope_next_level_message: {
    vars: ['{alcance}'],
    hint: '{alcance} es el que el lead acaba de nombrar.',
  },
  scope_only_presentation_message: {
    vars: ['{alcance}'],
    hint: '{alcance} es el que el lead acaba de nombrar.',
  },
  sibling_message: { vars: [], hint: 'Detrás van los botones con las otras opciones.' },
  sibling_up_message: { vars: [], hint: 'Detrás van los botones con lo que sí hay.' },
  sibling_none_message: { vars: [], hint: 'No lleva botones: no queda nada que ofrecer.' },
  unanchored_affirmative_message: { vars: [], hint: 'Detrás van los botones con las opciones.' },
  pending_offer_repeat_message: { vars: [], hint: 'Detrás se repiten los mismos botones.' },
  offer_appointment_label: {
    vars: [],
    hint: 'Es el texto de un botón: máximo 20 caracteres.',
  },
};
