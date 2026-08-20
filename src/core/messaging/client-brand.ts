/**
 * El vocabulario del negocio para los mensajes configurables: cómo se llama,
 * y cómo llama a sus proyectos.
 *
 * Vivía en `core/onboarding/client-vocabulary.ts`. Al retirar el compilador y
 * el onboarding se rescató lo que sigue en uso todos los días --resuelve
 * `{business_name}`, `{project_singular}`, `{project_plural}` en cada
 * mensaje del bot-- y se dejaron atrás el tono y el saludo compuesto, que
 * solo alimentaban al compilador y a un saludo automático ya retirado.
 */
import type { BrandTone, ClientBrandConfig } from '@/data/models/client-brand.model';

export const DEFAULT_PROJECT_SINGULAR = 'desarrollo';
export const DEFAULT_PROJECT_PLURAL = 'desarrollos';

export interface ClientVocabulary {
  singular: string;
  plural: string;
  singularTitle: string;
  pluralTitle: string;
  configured: boolean;
}

function titleCase(value: string): string {
  return value.charAt(0).toLocaleUpperCase('es-MX') + value.slice(1);
}

export function normalizeVocabulary(value: string, fallback: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized || fallback;
}

export function toClientVocabulary(
  config?: Partial<ClientBrandConfig> | null
): ClientVocabulary {
  const singular = normalizeVocabulary(
    config?.project_singular || '',
    DEFAULT_PROJECT_SINGULAR
  );
  const plural = normalizeVocabulary(
    config?.project_plural || '',
    DEFAULT_PROJECT_PLURAL
  );
  return {
    singular,
    plural,
    singularTitle: titleCase(singular),
    pluralTitle: titleCase(plural),
    configured: config?.is_configured === true,
  };
}

/**
 * Sustituye el vocabulario del cliente en un texto configurable.
 *
 * Solo expande marcadores explicitos. La version anterior buscaba y reemplazaba
 * las palabras "desarrollo", "fraccionamiento" y "proyecto" en el texto, y eso
 * reescribia lo que no debia:
 *
 *   "Calle Principal #123, Fraccionamiento Europa"  ->  "... Plaza Europa"
 *   "nuestro desarrollo"                            ->  "nuestro plaza"
 *   "Este proyecto de vivienda"                     ->  "Este plaza de vivienda"
 *
 * Un nombre propio dentro de la direccion que el bot manda a un lead que va a
 * ir fisicamente, el genero de la palabra elegida, y dos sustantivos comunes
 * del espanol. Ninguna heuristica sobre lenguaje natural distingue esos casos:
 * quien escribe el mensaje marca donde va la palabra, y donde no va, no va.
 */
export function renderClientVocabulary(
  text: string,
  vocabulary: ClientVocabulary
): string {
  return text
    .replaceAll('{project_singular}', vocabulary.singular)
    .replaceAll('{project_plural}', vocabulary.plural)
    .replaceAll('{project_singular_title}', vocabulary.singularTitle)
    .replaceAll('{project_plural_title}', vocabulary.pluralTitle);
}

export function renderClientBrand(
  text: string,
  config: Partial<ClientBrandConfig>
): string {
  return renderClientVocabulary(text, toClientVocabulary(config))
    .replaceAll('{business_name}', config.business_name?.trim() || '');
}

export function normalizeScopeAlias(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('es-MX')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
