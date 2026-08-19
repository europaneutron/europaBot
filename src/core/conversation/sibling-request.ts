/**
 * Pedir otro es pedir los hermanos: "¿y el otro?", "¿qué más tienen?" con el
 * foco puesto enumeran los hermanos del alcance en foco, no el catálogo
 * entero. Comprobación léxica, del mismo tipo que los afirmativos: no es una
 * intención del catálogo, es sintaxis de conversación.
 *
 * La comprobación se hace **antes** que el matcher, así que cualquier falso
 * positivo se traga la pregunta entera. Buscar la palabra en cualquier parte
 * del mensaje lo hacía constantemente:
 *
 *   "¿tienen otra forma de pago?"   -> enumeraba desarrollos
 *   "¿hay otro modelo disponible?"  -> enumeraba desarrollos
 *   "tengo otra pregunta"           -> enumeraba desarrollos
 *
 * Ese último rompía los checkpoints: el mensaje se desviaba antes de contarse,
 * y el bot no llegaba nunca a ofrecer la cita.
 *
 * La regla ahora es que la frase **cierre el mensaje**. Pedir otro es una
 * pregunta corta y completa --"¿y el otro?"-- mientras que en "otra forma de
 * pago" la palabra va seguida de aquello de lo que se pide otro, que es una
 * pregunta normal y tiene que llegar al matcher.
 */
const SIBLING_PHRASES = [
  'otro', 'otra', 'otros', 'otras',
  'los demas', 'los demás', 'las demas', 'las demás',
  'que mas tienen', 'qué más tienen', 'que mas hay', 'qué más hay',
  'mas opciones', 'más opciones', 'alternativas',
];

/** Signos que envuelven la frase sin cambiar lo que pide. */
const SURROUNDING_NOISE = /^[\s¿¡]+|[\s¿?¡!.,;:]+$/g;

export function isSiblingRequest(message: string): boolean {
  const normalized = message
    .toLowerCase()
    .replace(SURROUNDING_NOISE, '')
    .trim();
  if (!normalized) return false;

  return SIBLING_PHRASES.some(phrase => (
    normalized === phrase || normalized.endsWith(` ${phrase}`)
  ));
}
