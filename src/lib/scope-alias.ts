/**
 * Un alias corto para un alcance, cuando el nombre completo trae un
 * descriptor generico que el lead suele omitir.
 *
 * Vivía en `document-compiler/compiler-rules.ts` --se escribió para nombrar
 * alcances que el compilador proponía-- pero lo usan dos sitios que no son
 * del compilador: el rótulo de un botón/fila cuando no cabe entero
 * (`pending-offer-messages.ts`) y el alta manual de alcances (`/api/scopes`).
 * Al retirar el compilador se movió aquí, sin cambiar su comportamiento.
 *
 * La regla usa descriptores estructurales, no vocabulario inmobiliario:
 * "Residencial Altabrisa" da "Altabrisa", pero también cubre "Bodega Atlas" o
 * "Consultorio Norte".
 */

const GENERIC_SCOPE_PREFIXES = new Set([
  'bodega', 'consultorio', 'desarrollo', 'fraccionamiento', 'local', 'lote',
  'modelo', 'paquete', 'plan', 'residencial', 'tipo', 'unidad',
]);

/** Minusculas, sin acentos, para comparar el primer descriptor del nombre. */
function normalizeWord(word: string): string {
  return word
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function shortScopeAlias(name: string): string | null {
  const words = name.trim().split(/\s+/);
  if (words.length < 2 || !GENERIC_SCOPE_PREFIXES.has(normalizeWord(words[0]))) return null;
  const alias = words.slice(1).join(' ').trim();
  return alias.length >= 2 ? alias : null;
}
