import { isPureAffirmative } from '@/core/conversation/affirmative-phrases';

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

const DECLINE_PHRASES = ['no', 'nop', 'nel', 'ya no', 'no gracias', 'no quiero', 'olvidalo'];

/**
 * El lead cierra la captura. Es una comparación léxica de frases cortas y
 * completas, no una lectura de intención: "cancelar" vale en cualquier paso, y
 * "no" o "ya no" solo cuando son el mensaje entero. Cualquier otro texto sigue
 * siendo un candidato a nombre y pasa por la confirmación.
 */
export function isCancelReply(text: string): boolean {
  const normalized = normalize(text);
  if (!normalized) return false;
  return /\bcancel(ar|a|o)\b/.test(normalized) || DECLINE_PHRASES.includes(normalized);
}

/** Un "sí" que es el mensaje entero: confirma el candidato pendiente. */
export function isConfirmReply(text: string): boolean {
  return isPureAffirmative(text);
}
