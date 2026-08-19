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
import { shortScopeAlias } from '@/core/document-compiler/compiler-rules';
import type { PendingOfferOption } from '@/data/models/user.model';
import type { UserSession } from '@/data/models/user.model';

/**
 * Lo que WhatsApp admite en el cuerpo de un mensaje interactivo. Un texto mas
 * largo no se recorta: la API rechaza el envio entero y el lead se queda sin
 * respuesta. Con respuestas de una linea nunca importo; con la forma nueva
 * --apertura, dato, lista con vinetas y cierre-- deja de ser teorico.
 */
export const INTERACTIVE_BODY_MAX_LENGTH = 1024;

export interface OfferButtonsPresentation {
  format: 'buttons';
  /** Texto que va antes, como mensaje suelto, cuando no cabe en el cuerpo. */
  precedingText?: string;
  bodyText: string;
  buttons: Array<{ id: string; title: string }>;
}

export interface OfferListPresentation {
  format: 'list';
  precedingText?: string;
  bodyText: string;
  buttonText: string;
  rows: Array<{ id: string; title: string; description?: string }>;
}

/**
 * Parte una respuesta larga en lo que va suelto y lo que lleva los botones
 * pegados. El corte es la ultima linea --que con la forma nueva es el cierre
 * que ofrece el paso siguiente--, asi que los botones quedan justo debajo de
 * la pregunta que los pide.
 *
 * Devuelve `null` cuando ni siquiera esa ultima linea cabe: ahi es preferible
 * mandar el texto plano y quedarse sin botones que inventar un cuerpo que
 * nadie escribio. La oferta sigue viva en la sesion, asi que un "si" escrito
 * se resuelve igual.
 */
export function splitForInteractiveBody(
  bodyText: string,
  maxLength: number = INTERACTIVE_BODY_MAX_LENGTH
): { precedingText?: string; bodyText: string } | null {
  const text = bodyText.trim();
  if (text.length <= maxLength) return { bodyText: text };

  const lastBreak = text.lastIndexOf('\n');
  if (lastBreak <= 0) return null;

  const closing = text.slice(lastBreak + 1).trim();
  const preceding = text.slice(0, lastBreak).trimEnd();
  if (!closing || closing.length > maxLength || !preceding) return null;

  return { precedingText: preceding, bodyText: closing };
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

/**
 * El limite de WhatsApp --20 caracteres en un boton-- se reparte entre las
 * partes de la etiqueta, no se aplica cortando por el final.
 *
 * Cortar dejaba "Residencial Europa · " y "Residencial Altabris": el dato que
 * distingue la opcion, que es justo para lo que esta ahi, era lo primero en
 * caerse. Se recorta el nombre y se conserva entero lo que viene detras.
 */
function labelFor(option: PendingOfferOption, maxLength: number): string {
  if (option.label.length <= maxLength) return option.label;

  const [fullName, ...rest] = option.label.split(' · ');
  const tail = rest.join(' · ');
  // "Modelo Solara" cabe como "Solara": el descriptor generico es lo primero
  // que sobra cuando no cabe todo, y es como lo nombra el lead de todos modos.
  const name = shortScopeAlias(fullName) || fullName;
  if (!tail) return name.slice(0, maxLength).trimEnd();

  const room = maxLength - tail.length - 3;
  return room >= 3
    ? `${name.slice(0, room).trimEnd()} · ${tail}`
    : tail.slice(0, maxLength).trimEnd();
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

  // Una sola opcion tambien se presenta: es la oferta declarada por una
  // respuesta --"¿Te muestro las amenidades?"-- y su boton es lo que convierte
  // el "si" en un toque que el bot resuelve sin adivinar. Antes se descartaba
  // por tener menos de dos, asi que la oferta existia en la sesion y el lead
  // no veia nada.
  const options = session!.pending_offer_options!.filter(option => option.label.trim());
  if (options.length === 0) return null;

  const body = splitForInteractiveBody(bodyText);
  if (!body) return null;

  const format = chooseEnumerationFormat(options.length);
  if (format === 'buttons') {
    return {
      format: 'buttons',
      ...body,
      buttons: options.slice(0, MAX_BUTTON_OPTIONS).map(option => ({
        id: option.id,
        title: labelFor(option, 20),
      })),
    };
  }
  if (format === 'list') {
    return {
      format: 'list',
      ...body,
      buttonText: 'Ver opciones',
      rows: options.map(option => ({
        id: option.id,
        title: labelFor(option, 24),
      })),
    };
  }
  return null;
}
