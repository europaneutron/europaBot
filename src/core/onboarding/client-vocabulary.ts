import type { BrandTone, ClientBrandConfig } from '@/data/models/onboarding.model';

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

function preserveCase(source: string, replacement: string): string {
  return source.charAt(0) === source.charAt(0).toLocaleUpperCase('es-MX')
    ? titleCase(replacement)
    : replacement;
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
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function toneInstruction(tone: BrandTone): string {
  if (tone === 'direct') {
    return 'Usa un tono directo: abre con el dato, elimina adjetivos y limita cada respuesta a dos frases breves.';
  }
  if (tone === 'formal') {
    return 'Usa un tono formal y claro: trato de usted, lenguaje sobrio y respuestas de dos frases breves como máximo.';
  }
  return 'Usa un tono cercano y claro: trato natural, sin exageraciones y respuestas de dos frases breves como máximo.';
}

export function toneSamples(projectName: string, factValue?: string): Array<{
  tone: BrandTone;
  label: string;
  message: string;
}> {
  const name = projectName.trim() || 'Toscana';
  const value = factValue?.trim() || '$1,950,000';
  return [
    {
      tone: 'friendly',
      label: 'Cercano',
      message: `${name} tiene opciones desde ${value}. Si quieres, te cuento qué incluye cada una.`,
    },
    {
      tone: 'direct',
      label: 'Directo',
      message: `${name}: precios desde ${value}. Hay disponibilidad para visita esta semana.`,
    },
    {
      tone: 'formal',
      label: 'Formal',
      message: `${name} ofrece opciones desde ${value}. Puedo compartirle sus características y disponibilidad.`,
    },
  ];
}

export function composeBusinessGreeting(
  businessName: string,
  projectNames: string[],
  vocabulary: ClientVocabulary
): string {
  const identity = businessName.trim() || 'nuestro equipo';
  const names = Array.from(new Map(
    projectNames
      .map(name => name.trim())
      .filter(Boolean)
      .map(name => [name.toLocaleLowerCase('es-MX'), name])
  ).values());
  const availability = names.length === 0
    ? `Puedo ayudarte a conocer ${vocabulary.plural}.`
    : names.length === 1
      ? `Puedo ayudarte con ${names[0]}.`
      : `Puedo ayudarte con ${names.slice(0, -1).join(', ')} y ${names.at(-1)}.`;

  return `Hola. Soy el asistente virtual de ${identity}. ${availability}\n\nPuedo responder tus preguntas y ayudarte a agendar una visita. ¿En qué puedo ayudarte?`;
}
