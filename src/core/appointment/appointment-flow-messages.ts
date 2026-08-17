import { resolveConfiguredMessage } from '@/core/messaging/configured-message';
import { conversationRepository } from '@/data/repositories/conversation.repository';
import { userRepository } from '@/data/repositories/user.repository';

export interface FlowButton {
  id: string;
  title: string;
}

export interface FlowMessage {
  bodyText: string;
  buttons: FlowButton[];
}

/**
 * Los mensajes con botones del flujo de cita, en un solo lugar.
 *
 * Estaban escritos dentro de la ruta del webhook, que es transporte. Ahí solo
 * los alcanza el webhook, así que el primer consumidor nuevo --el simulador--
 * tuvo que copiarlos, y las copias divergieron el mismo día: la del simulador
 * perdió el emoji inicial, dibujó los botones como texto entre corchetes y no
 * reprodujo la regla de no repetir la pregunta. Una herramienta cuyo único
 * trabajo es enseñar lo que el bot manda no puede tener su propia versión de lo
 * que el bot manda.
 *
 * Quien necesite estos mensajes los pide aquí y los entrega por su medio: el
 * webhook como botones de WhatsApp, el simulador como botones en pantalla.
 */
export async function nextAppointmentFlowMessage(
  userId: string
): Promise<FlowMessage | null> {
  const state = await userRepository.getAppointmentFlowState(userId);
  const message = await composeForState(userId, state);
  if (!message) return null;

  // No repetir lo que ya se acaba de mandar.
  //
  // La versión anterior buscaba un fragmento literal del texto por defecto
  // ("¡Veo que estás muy interesado!"). Ese mensaje es configurable: en cuanto
  // un cliente lo cambiaba, la comprobación dejaba de reconocerlo y el bot lo
  // mandaba dos veces. Comparar contra el texto que se va a emitir no depende
  // de que nadie lo edite.
  const lastOutgoing = await conversationRepository.getLastOutgoingMessage(userId);
  if (lastOutgoing === message.bodyText) return null;

  return message;
}

async function composeForState(
  userId: string,
  state: string | null
): Promise<FlowMessage | null> {
  if (state === 'pending_auto_offer') {
    return {
      bodyText: await resolveConfiguredMessage(
        'auto_offer_message',
        '¡Veo que estás muy interesado! 🎉 ¿Te gustaría agendar una visita para conocer el fraccionamiento en persona?'
      ),
      buttons: [
        { id: 'appointment_yes', title: 'Sí, me interesa' },
        { id: 'appointment_no', title: 'No, gracias' },
      ],
    };
  }

  if (state === 'confirm_date') {
    const requestedDate = (await userRepository.getAppointmentFlowData(userId))?.requested_date;
    if (!requestedDate) return null;
    const dateText = new Date(`${requestedDate}T00:00:00`).toLocaleDateString('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    return {
      bodyText: `📅 Entendido, quieres visitarnos el *${dateText}*.\n\n¿Es correcto?`,
      buttons: [
        { id: 'confirm_date', title: '✅ Sí, continuar' },
        { id: 'change_date', title: '❌ Cambiar fecha' },
      ],
    };
  }

  if (state === 'ask_time') {
    return {
      bodyText: '¿En qué horario prefieres visitarnos?',
      buttons: [
        { id: 'morning', title: 'Mañana 9-12' },
        { id: 'afternoon', title: 'Tarde 12-15' },
        { id: 'evening', title: 'Noche 15-18' },
      ],
    };
  }

  return null;
}
