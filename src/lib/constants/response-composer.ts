/**
 * Constantes del editor de respuestas por bloques (response-composer)
 *
 * Acotan el presupuesto de tiempo del webhook: sendFragmentedMessage espera cada
 * delay de forma secuencial y bloqueante, y el webhook responde 200 solo después
 * de enviar todos los bloques. Ver openspec/changes/fragment-editor/design.md.
 */

/**
 * Valores de pausa ofrecidos en el selector de cada bloque, en milisegundos.
 * No se expone un campo numérico libre: solo estos valores son válidos.
 */
export const BLOCK_DELAY_OPTIONS = [
  { label: 'Sin pausa', value: 0 },
  { label: 'Corta', value: 800 },
  { label: 'Media', value: 1200 },
  { label: 'Larga', value: 2000 },
] as const;

/** Pausa asignada por defecto a los bloques nuevos. */
export const DEFAULT_BLOCK_DELAY = 1200;

/** Número máximo de bloques permitidos en una respuesta. */
export const MAX_RESPONSE_BLOCKS = 6;

/**
 * Umbral de tiempo estimado de envío, en milisegundos, a partir del cual
 * el editor advierte sobre el riesgo de reintentos de Meta y mensajes duplicados.
 */
export const RESPONSE_TIME_WARNING_THRESHOLD_MS = 10000;

/**
 * Estimación de ida y vuelta a la API de Meta por bloque, en milisegundos,
 * usada junto con los delays configurados para calcular el tiempo total estimado.
 */
export const ESTIMATED_ROUND_TRIP_MS_PER_BLOCK = 500;

/**
 * Calcula el tiempo total estimado de envío de una secuencia de bloques.
 */
export function estimateSendTimeMs(delays: number[]): number {
  const totalDelay = delays.reduce((sum, delay) => sum + delay, 0);
  const totalRoundTrips = delays.length * ESTIMATED_ROUND_TRIP_MS_PER_BLOCK;
  return totalDelay + totalRoundTrips;
}
