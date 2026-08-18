/**
 * Cómo se presenta la oferta pendiente como componente interactivo, en un
 * solo lugar. Mismo motivo que `appointment-flow-messages.ts`: quien decide
 * el formato tiene que ser uno solo, para que el webhook mande lo mismo que
 * el simulador enseña.
 *
 * Solo una oferta de dos o más opciones se presenta como botones o lista: una
 * oferta de una sola opción es una pregunta de sí/no plana, no una elección
 * entre alternativas.
 */
import { userRepository } from '@/data/repositories/user.repository';
import { SCOPE_FOCUS_WINDOW_MS } from './scope-routing.service';
import { chooseEnumerationFormat, MAX_BUTTON_OPTIONS } from './scope-enumeration.service';
import type { PendingOfferOption } from '@/data/models/user.model';
import type { UserSession } from '@/data/models/user.model';

export interface OfferButtonsPresentation {
  format: 'buttons';
  bodyText: string;
  buttons: Array<{ id: string; title: string }>;
}

export interface OfferListPresentation {
  format: 'list';
  bodyText: string;
  buttonText: string;
  rows: Array<{ id: string; title: string; description?: string }>;
}

export type OfferPresentation = OfferButtonsPresentation | OfferListPresentation | null;

export function isPendingOfferFresh(session: UserSession | null | undefined): boolean {
  if (!session?.pending_offer_options?.length || !session.pending_offer_updated_at) return false;
  const updatedAt = new Date(session.pending_offer_updated_at).getTime();
  return Number.isFinite(updatedAt) && Date.now() - updatedAt < SCOPE_FOCUS_WINDOW_MS;
}

export interface PendingOfferSelectionMatch {
  option: PendingOfferOption;
  matchedBy: 'id' | 'label';
}

/**
 * Resuelve el mensaje del lead contra las opciones de la oferta viva, antes
 * de que llegue al matcher general. Un toque manda el identificador (`id`)
 * tal cual; un mensaje escrito se compara contra el nombre de cada opción.
 * Es vocabulario cerrado y pequeño: la comparación por inclusión es segura
 * aquí y evita que el nombre tenga que competir con el resto del catálogo.
 */
export function resolvePendingOfferSelection(
  session: UserSession | null | undefined,
  messageText: string
): PendingOfferSelectionMatch | null {
  if (!isPendingOfferFresh(session)) return null;
  const options = session!.pending_offer_options!;
  const normalized = messageText.trim();
  if (!normalized) return null;

  const byId = options.find(option => option.id === normalized);
  if (byId) return { option: byId, matchedBy: 'id' };

  // Por palabra completa, no por subcadena: un alcance corto --"Sol", "Mar"--
  // aparece dentro de palabras que no lo nombran, y elegir opcion por accidente
  // es peor que no reconocerla y dejar que siga al matcher.
  const normalizedLower = normalized.toLowerCase();
  const byLabel = options.find(option => {
    const name = option.label.split(' · ')[0].toLowerCase();
    if (name.length === 0) return false;
    if (normalizedLower === name) return true;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|\\W)${escaped}(\\W|$)`, 'i').test(normalizedLower);
  });
  return byLabel ? { option: byLabel, matchedBy: 'label' } : null;
}

/**
 * Las opciones de la oferta viva como botones planos, para un transporte que
 * no distingue botones de lista --el simulador del panel--. Mismo origen que
 * `currentOfferPresentation`: lo que se ofrece no cambia con el transporte.
 *
 * Existe porque el simulador enseñaba la pregunta sin ninguna opción mientras
 * WhatsApp recibía los botones, y es la pantalla con la que se verifica todo.
 */
export async function offerButtons(
  userId: string,
  bodyText: string
): Promise<Array<{ id: string; title: string }>> {
  const presentation = await currentOfferPresentation(userId, bodyText);
  if (!presentation) return [];
  return presentation.format === 'buttons'
    ? presentation.buttons
    : presentation.rows.map(row => ({ id: row.id, title: row.title }));
}

function labelFor(option: PendingOfferOption, maxLength: number): string {
  return option.label.length > maxLength ? option.label.slice(0, maxLength) : option.label;
}

/**
 * La presentación interactiva de la oferta viva del usuario, si la hay y si
 * tiene más de una opción. `bodyText` la pasa quien llama: es el mismo texto
 * que ya se guarda como mensaje saliente, para no mandarlo duplicado.
 */
export async function currentOfferPresentation(
  userId: string,
  bodyText: string
): Promise<OfferPresentation> {
  const session = await userRepository.getSession(userId);
  if (!isPendingOfferFresh(session)) return null;

  const options = session!.pending_offer_options!;
  if (options.length < 2) return null;

  const format = chooseEnumerationFormat(options.length);
  if (format === 'buttons') {
    return {
      format: 'buttons',
      bodyText,
      buttons: options.slice(0, MAX_BUTTON_OPTIONS).map(option => ({
        id: option.id,
        title: labelFor(option, 20),
      })),
    };
  }
  if (format === 'list') {
    return {
      format: 'list',
      bodyText,
      buttonText: 'Ver opciones',
      rows: options.map(option => ({
        id: option.id,
        title: labelFor(option, 24),
      })),
    };
  }
  return null;
}
