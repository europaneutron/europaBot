/**
 * Cómo se manda cada pieza de una respuesta del bot, en un solo lugar.
 *
 * Vivía repetido dentro del webhook, y ahí es donde se coló el bug: los
 * botones y la lista sólo se adjuntaban en la rama de texto plano. Una
 * respuesta fragmentada --que es como se guarda TODO lo que se escribe con
 * el editor de bloques desde que existe, botones incluidos-- mandaba sus
 * fragmentos con `sendFragmentedMessage` sin mirar nunca si había una oferta
 * pendiente. Cualquier botón o lista configurada a mano quedaba escrita en
 * la base y nunca llegaba a WhatsApp.
 *
 * Separado a su propio módulo para poder probarlo sustituyendo
 * `whatsappSender` por dobles que no tocan la red: la lógica de "a qué
 * fragmento le cuelgan los botones" es la que hay que verificar, no si la
 * API de Meta responde.
 */
import { whatsappSender } from '@/services/whatsapp/message-sender';
import { currentOfferPresentation } from '@/core/conversation/pending-offer-messages';
import type { MessageFragment } from '@/types/message-fragments.types';

/**
 * Manda un texto como el último mensaje del turno, con la oferta viva
 * colgando si la hay --botones o lista, según cuántas opciones tenga--.
 *
 * Los botones cuelgan del último mensaje que se manda, no de "la respuesta
 * si es de tal formato": por eso esta función no distingue de dónde viene el
 * texto, y `sendFragmentedResponse` la usa para su último fragmento de texto
 * exactamente igual que para una respuesta simple.
 *
 * No guarda en BD: quien llama ya lo hace, con el texto que corresponda.
 */
export async function sendFinalText(to: string, userId: string | undefined, text: string): Promise<void> {
  const isTimeSelection = text.includes('¿En qué momento del día') ||
                         text.includes('momento del día prefieres');

  const offerPresentation = userId
    ? await currentOfferPresentation(userId, text)
    : null;

  // Una respuesta que no cabe en el cuerpo interactivo viaja en dos piezas:
  // el texto suelto y despues el cierre con los botones. La API rechaza el
  // envio entero si el cuerpo pasa de 1024, asi que sin esto el lead se
  // quedaba sin ninguna de las dos.
  if (offerPresentation?.precedingText) {
    await whatsappSender.sendTextMessage({ to, message: offerPresentation.precedingText });
  }

  if (offerPresentation?.format === 'buttons') {
    await whatsappSender.sendInteractiveButtons({
      to,
      bodyText: offerPresentation.bodyText,
      buttons: offerPresentation.buttons,
    });
  } else if (offerPresentation?.format === 'list') {
    await whatsappSender.sendListMessage({
      to,
      bodyText: offerPresentation.bodyText,
      buttonText: offerPresentation.buttonText,
      rows: offerPresentation.rows,
    });
  } else if (isTimeSelection) {
    await whatsappSender.sendInteractiveButtons({
      to,
      bodyText: text,
      buttons: [
        { id: 'morning', title: 'Mañana' },
        { id: 'afternoon', title: 'Tarde' },
        { id: 'evening', title: 'Noche' }
      ]
    });
  } else {
    await whatsappSender.sendTextMessage({ to, message: text });
  }
}

/**
 * Manda los fragmentos de una respuesta fragmentada, con la oferta viva
 * colgando del último si es texto.
 *
 * Solo aplica cuando el último fragmento es texto: unos botones no tienen
 * dónde colgar de una foto o un documento, así que ahí se manda tal cual,
 * como antes.
 */
export async function sendFragmentedResponse(
  to: string,
  userId: string | undefined,
  fragments: MessageFragment[]
): Promise<void> {
  const lastFragment = fragments[fragments.length - 1];

  if (lastFragment?.type !== 'text') {
    await whatsappSender.sendFragmentedMessage(to, fragments);
    return;
  }

  await whatsappSender.sendFragmentedMessage(to, fragments.slice(0, -1));
  if (lastFragment.delay > 0) {
    await new Promise(resolve => setTimeout(resolve, lastFragment.delay));
  }
  await sendFinalText(to, userId, lastFragment.content);
}
