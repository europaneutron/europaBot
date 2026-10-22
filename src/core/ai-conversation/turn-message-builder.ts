export interface ActiveAppointmentFact {
  /** Fecha ya en palabras, sin relativos: "jueves 22 de octubre". */
  date: string;
  /** Horario ya en palabras: "de 12:00 a 15:00 h". */
  hours: string;
  development?: string | null;
  visitorName?: string | null;
  /** Cuándo se agendó: desde ahí lee el modelo la conversación. */
  bookedAt?: string | null;
}

export interface TurnFacts {
  now: Date;
  timeZone?: string;
  adOrigin?: string | null;
  hasActiveAppointment: boolean;
  /** Detalle de la cita vigente; sin él solo se sabe que existe. */
  appointment?: ActiveAppointmentFact | null;
  shouldOfferAppointment: boolean;
}

/** Recibe el reloj para que el estado variable nunca altere el prefijo cacheable. */
export function buildTurnMessage(facts: TurnFacts): { role: 'system'; content: string } {
  const timeZone = facts.timeZone || 'America/Mexico_City';
  const date = new Intl.DateTimeFormat('es-MX', {
    timeZone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }).format(facts.now);
  return {
    role: 'system',
    content: [
      `Para interpretar fechas relativas ("hoy", "mañana", "el sábado"): hoy es ${date}, zona horaria ${timeZone}.`,
      facts.adOrigin ? `La conversación se originó en un anuncio de ${facts.adOrigin}.`
        : 'El origen publicitario de la conversación no está registrado.',
      appointmentFact(facts),
      // Con visita ya agendada, proponer otra contradice el dato de arriba.
      facts.shouldOfferAppointment && !facts.hasActiveAppointment
        ? 'La persona está lista para conocer el desarrollo en persona: en este mensaje le propones la visita.' : '',
    ].filter(Boolean).join('\n'),
  };
}

/**
 * La cita va en cada turno, justo antes de la respuesta: el lugar más visible del
 * prompt. Escrita como alerta ("quedó reemplazado", "no hay otra fecha pendiente")
 * el modelo la repetía en cada mensaje, como si hubiera algo que aclarar. Va corta,
 * con la razón por la que no hace falta repetirla y con lo que procede si la
 * persona pregunta por ella. Sin la confirmación a la vista en el historial, que solo
 * trae los últimos mensajes, el modelo dudaba de la cita; nombrar un "registro" lo
 * empeoró ("no tengo acceso al registro de citas"), y añadir quién la cambia hacía
 * que ofreciera cambiarla sin que nadie lo pidiera.
 */
function appointmentFact(facts: TurnFacts): string {
  if (!facts.hasActiveAppointment) return 'El lead está sin cita activa.';
  const appointment = facts.appointment;
  const detail = appointment
    ? `: ${appointment.date}, ${appointment.hours}${appointment.development ? `, en ${appointment.development}` : ''}`
    : '';
  return `Visita agendada de la persona${detail}. La eligió ella misma y se le confirmó al agendarla; si pregunta por su cita, esa es la respuesta.`;
}
