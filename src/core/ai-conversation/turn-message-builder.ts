export interface ActiveAppointmentFact {
  /** Fecha ya en palabras, sin relativos: "jueves 22 de octubre". */
  date: string;
  /** Horario ya en palabras: "de 12:00 a 15:00 h". */
  hours: string;
  development?: string | null;
  visitorName?: string | null;
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
      facts.shouldOfferAppointment ? 'La persona está lista para conocer el desarrollo en persona: en este mensaje le propones la visita.' : '',
    ].filter(Boolean).join('\n'),
  };
}

/** Qué se agendó, como hecho: la persona lo eligió en el formulario y esa es la fecha vigente. */
function appointmentFact(facts: TurnFacts): string {
  if (!facts.hasActiveAppointment) return 'El lead está sin cita activa.';
  const appointment = facts.appointment;
  if (!appointment) return 'El lead tiene una cita activa.';
  const place = appointment.development ? ` en ${appointment.development}` : '';
  const name = appointment.visitorName ? ` a nombre de ${appointment.visitorName}` : '';
  return `El lead tiene una cita activa: ${appointment.date}, ${appointment.hours}${place}${name}. La persona eligió esa fecha y ese horario en el formulario de citas: son la fecha pedida, y el día que mencionó antes de llenarlo quedó reemplazado por esta elección. No hay otra fecha pendiente de agendar.`;
}
