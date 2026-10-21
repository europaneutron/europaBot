import type { BotResponse, DocumentFragment } from '@/types/message-fragments.types';

/** Subconjunto de ContextResponseRow que necesita la resolución del brochure. */
export interface BrochureSourceRow {
  intent_name: string;
  message_text: unknown;
  is_navigation: boolean;
  order_priority: number;
}

export const BROCHURE_INTENT_NAME = 'brochure';

export function documentFragments(message: unknown): DocumentFragment[] {
  if (!message || typeof message !== 'object') return [];
  const fragments = (message as { fragments?: unknown }).fragments;
  if (!Array.isArray(fragments)) return [];
  return fragments.filter((item): item is DocumentFragment => !!item && typeof item === 'object'
    && (item as { type?: unknown }).type === 'document'
    && typeof (item as { url?: unknown }).url === 'string' && !!(item as { url: string }).url.trim()
    && typeof (item as { filename?: unknown }).filename === 'string');
}

/**
 * En datos reales el PDF vive como fragmento `document` dentro de una respuesta, no
 * en `resources`. Se recorre la cadena del alcance (propio, luego ancestros) con la
 * misma regla de sustitución que el resto de la herencia: el primer nivel que tiene
 * documentos gana por completo, y dentro de él manda la intención brochure.
 */
export function resolveBrochureDocuments(
  chain: string[], rowsAt: (scopeId: string) => BrochureSourceRow[]
): DocumentFragment[] {
  for (const scopeId of chain) {
    const rows = rowsAt(scopeId).filter(row => !row.is_navigation)
      .map(row => ({ row, documents: documentFragments(row.message_text) }))
      .filter(item => item.documents.length > 0)
      .sort((a, b) => Number(b.row.intent_name === BROCHURE_INTENT_NAME) - Number(a.row.intent_name === BROCHURE_INTENT_NAME)
        || a.row.order_priority - b.row.order_priority);
    if (!rows.length) continue;
    const preferred = rows.filter(item => item.row.intent_name === BROCHURE_INTENT_NAME);
    const selected = preferred.length ? preferred : [rows[0]];
    const seen = new Set<string>();
    return selected.flatMap(item => item.documents).filter(document => !seen.has(document.url) && !!seen.add(document.url));
  }
  return [];
}

export function documentResponse(documents: DocumentFragment[]): BotResponse[] {
  return documents.length
    ? [{ fragments: documents.map(document => ({ type: 'document', url: document.url, filename: document.filename, delay: 0 })) }]
    : [];
}

/** Nombre de archivo que el lead recibirá, para que la herramienta lo informe como hecho. */
export function attachmentNames(responses: BotResponse[]): string[] {
  return responses.flatMap(response => {
    if (typeof response === 'string') return [];
    if ('fragments' in response) return response.fragments.flatMap(item => item.type === 'document' ? [item.filename] : []);
    return [decodeURIComponent(response.media_url.split('?')[0].split('/').pop() || '').replace(/^\d+_/, '') || 'documento'];
  });
}
