/**
 * La lista de afirmativos, en un solo lugar. Vivía solo dentro del flujo de
 * cita; ahora la consulta también la resolución de la oferta pendiente, así
 * que un cambio a la lista no puede quedarse desincronizado entre las dos.
 */
const AFFIRMATIVE_PHRASES = [
  'si', 'sí', 'claro', 'ok', 'vale', 'dale', 'yes',
  'por favor', 'porfavor', 'esta bien', 'está bien',
  'adelante', 'vamos', 'perfecto', 'excelente',
  'me interesa', 'quiero', 'acepto',
];

/**
 * Un mensaje es afirmativo cuando, quitando espacios, es exactamente una de
 * las frases, o cuando una de ellas aparece como palabra completa dentro de
 * un mensaje corto. No es una detección de intención: es la misma
 * comprobación léxica que ya usaba el flujo de cita.
 */
export function isAffirmative(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  if (!normalized) return false;
  return AFFIRMATIVE_PHRASES.some(phrase => {
    if (normalized === phrase) return true;
    const regex = new RegExp(`\\b${phrase}\\b`, 'i');
    return regex.test(normalized);
  });
}

/**
 * Igual, pero exige que el mensaje entero sea el afirmativo, no que lo
 * contenga. "sí" es una respuesta a la oferta; "quiero agendar" no lo es
 * aunque "quiero" esté en la lista — es una petición nueva y completa, y
 * tratarla como un "sí" a lo que se ofreció antes le roba la palabra al
 * lead. Se usa donde no hay otro filtro (como el de pregunta nueva del flujo
 * de cita) para separar los dos casos.
 */
export function isPureAffirmative(message: string): boolean {
  const normalized = message.toLowerCase().trim().replace(/[!¡.¿?]+$/g, '');
  if (!normalized) return false;
  return AFFIRMATIVE_PHRASES.includes(normalized);
}
