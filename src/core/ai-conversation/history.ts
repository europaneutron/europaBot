import type Anthropic from '@anthropic-ai/sdk';

export interface HistoryRow {
  direction: string;
  message_text?: string;
  message_id?: string;
  created_at?: string | Date;
}

/**
 * Con una cita agendada, el modelo lee la conversación desde que se agendó.
 *
 * Antes de agendar el lead suele nombrar un día ("quisiera ir el sábado") y luego
 * escoge otro en el formulario. Con las dos fechas a la vista el modelo contraponía
 * una con otra ("me dijiste que preferías el sábado") aunque la nota del turno dijera
 * cuál eligió. Lo previo a agendar ya no hace falta: el lead está en la última etapa y
 * el contenido completo sigue en el prompt. Solo cambia lo que lee el modelo; la
 * conversación guardada queda completa.
 */
export function historySinceBooking<T extends HistoryRow>(rows: readonly T[], bookedAt?: string | null): T[] {
  if (!bookedAt) return [...rows];
  // Sin margen: el envío del formulario se guarda después de crear la cita, y las dos
  // horas las pone la misma base. Con un margen, un "quisiera ir el sábado" escrito
  // segundos antes quedaba dentro.
  const since = new Date(bookedAt).getTime();
  if (!Number.isFinite(since)) return [...rows];
  return rows.filter(row => !row.created_at || new Date(row.created_at).getTime() >= since);
}

/** El repositorio entrega primero el más reciente; se descarta un inicio huérfano del bot. */
export function buildHistory(rows: readonly HistoryRow[], messageId?: string): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];
  for (const row of [...rows.slice(0, 10)].reverse()) {
    if (messageId && row.message_id === messageId) continue;
    const text = row.message_text?.trim();
    if (!text) continue;
    const role = ['inbound', 'incoming'].includes(row.direction) ? 'user'
      : ['outbound', 'outgoing'].includes(row.direction) ? 'assistant' : null;
    if (!role || (!messages.length && role !== 'user')) continue;
    const previous = messages[messages.length - 1];
    if (previous?.role === role) previous.content += `\n${text}`;
    else messages.push({ role, content: text });
  }
  return messages;
}

export function appendUserMessage(messages: Anthropic.MessageParam[], text: string) {
  const last = messages[messages.length - 1];
  if (last?.role === 'user' && typeof last.content === 'string') last.content += `\n${text}`;
  else messages.push({ role: 'user', content: text });
}

/**
 * Los últimos mensajes previos al actual, del más viejo al más nuevo, para que el
 * clasificador entienda referencias ("esa"). Dos turnos son hasta cuatro mensajes.
 */
export function recentTurns(rows: readonly HistoryRow[], messageId?: string, maxMessages = 4):
  Array<{ role: 'persona' | 'asistente'; text: string }> {
  const turns: Array<{ role: 'persona' | 'asistente'; text: string }> = [];
  for (const row of rows) {
    if (turns.length >= maxMessages) break;
    if (messageId && row.message_id === messageId) continue;
    const text = row.message_text?.trim();
    if (!text) continue;
    const role = ['inbound', 'incoming'].includes(row.direction) ? 'persona'
      : ['outbound', 'outgoing'].includes(row.direction) ? 'asistente' : null;
    if (role) turns.push({ role, text });
  }
  return turns.reverse();
}
