import type Anthropic from '@anthropic-ai/sdk';

export interface HistoryRow {
  direction: string;
  message_text?: string;
  message_id?: string;
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
