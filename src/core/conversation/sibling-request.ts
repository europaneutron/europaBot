/**
 * Pedir otro es pedir los hermanos: "otro", "¿qué más tienen?", "¿y los
 * demás?" con el foco puesto enumeran los hermanos del alcance en foco, no el
 * catálogo entero. Comprobación léxica, del mismo tipo que los afirmativos:
 * no es una intención del catálogo, es sintaxis de conversación.
 */
const SIBLING_PHRASES = [
  'otro', 'otra', 'otros', 'otras',
  'los demas', 'los demás', 'las demas', 'las demás',
  'y los demas', 'y los demás',
  'que mas tienen', 'qué más tienen', 'que mas hay', 'qué más hay',
  'mas opciones', 'más opciones', 'alternativas',
];

export function isSiblingRequest(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  if (!normalized) return false;
  return SIBLING_PHRASES.some(phrase => normalized.includes(phrase));
}
