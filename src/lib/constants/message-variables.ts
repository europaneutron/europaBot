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
  scope_disambiguation_message: {
    vars: ['{alcances}'],
    hint: 'Detrás van los botones, así que termina en la pregunta.',
    scene: {
      lead: '¿qué medidas tienen los lotes?',
      variables: (names: string[]) => ({ alcances: names.join(' y ') }),
      buttons: (names: string[]) => names,
    },
  },
};
