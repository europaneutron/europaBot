export interface TurnFacts {
  now: Date;
  timeZone?: string;
  adOrigin?: string | null;
  hasActiveAppointment: boolean;
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
      facts.hasActiveAppointment ? 'El lead tiene una cita activa.' : 'El lead está sin cita activa.',
      facts.shouldOfferAppointment ? 'La persona está lista para conocer el desarrollo en persona: en este mensaje le propones la visita.' : '',
    ].filter(Boolean).join('\n'),
  };
}
