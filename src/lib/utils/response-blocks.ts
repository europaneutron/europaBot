/**
 * Conversión entre filas de `bot_responses` y la lista de bloques del editor.
 *
 * Un bloque de la interfaz equivale a un `MessageFragment` (ver design.md del
 * cambio fragment-editor): la serialización es directa, sin modelo intermedio.
 * Lo único que se agrega es un `id` local para las claves de React y el
 * reordenamiento en el editor; se descarta al serializar de vuelta.
 */

import type {
  MessageFragment,
  FragmentedResponse,
} from '@/types/message-fragments.types';
import { DEFAULT_BLOCK_DELAY, BLOCK_DELAY_OPTIONS } from '@/lib/constants/response-composer';

export type EditorBlock = MessageFragment & { id: string };

/** Pausa asignada al bloque de media al convertir una respuesta legacy con media_url. */
const LEGACY_MEDIA_DELAY = BLOCK_DELAY_OPTIONS.find((option) => option.label === 'Corta')!.value;

/** Fila mínima de `bot_responses` necesaria para derivar los bloques del editor. */
export interface ResponseRow {
  message_text: unknown;
  media_url: string | null;
  response_type: string;
}

let blockIdCounter = 0;

function nextBlockId(): string {
  blockIdCounter += 1;
  return `block-${Date.now()}-${blockIdCounter}`;
}

/**
 * Deriva el tipo de bloque de media a partir de la extensión de una URL.
 * Se usa tanto para convertir `media_url` legacy como para los archivos que
 * llegan desde MediaLibrary, donde el tipo real del archivo debe prevalecer
 * sobre el botón que el administrador usó para abrir la biblioteca.
 */
export function blockTypeFromUrl(url: string): 'image' | 'document' | 'video' {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase();

  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext || '')) return 'image';
  if (['mp4', 'mov', 'avi'].includes(ext || '')) return 'video';

  return 'document';
}

/**
 * Extrae un nombre de archivo legible de una URL, removiendo el timestamp
 * que MediaLibrary antepone al subir (formato `1763590848232_nombre.pdf`),
 * igual que hace el webhook al enviar respuestas simples con media.
 */
function filenameFromUrl(url: string): string {
  const encodedName = url.split('?')[0].split('/').pop() || 'archivo';
  let rawName = encodedName;

  try {
    rawName = decodeURIComponent(encodedName);
  } catch {
    // Una URL legacy malformada no debe impedir que el editor abra la respuesta.
  }

  return rawName.replace(/^\d{13}_/, '') || rawName;
}

/**
 * Convierte una fila de `bot_responses` a la lista de bloques que edita la interfaz,
 * cubriendo los tres formatos de lectura: fragmentado, simple con `media_url`, y
 * simple de solo texto.
 */
export function responseRowToBlocks(row: ResponseRow): EditorBlock[] {
  if (row.response_type === 'fragmented' && row.message_text && typeof row.message_text === 'object') {
    const fragmented = row.message_text as FragmentedResponse;
    const fragments = Array.isArray(fragmented.fragments) ? fragmented.fragments : [];
    return fragments.map((fragment) => ({ ...fragment, id: nextBlockId() }));
  }

  const blocks: EditorBlock[] = [];
  const text = typeof row.message_text === 'string' ? row.message_text : null;

  if (text) {
    blocks.push({ id: nextBlockId(), type: 'text', content: text, delay: 0 });
  }

  if (row.media_url && row.media_url.trim()) {
    const mediaUrl = row.media_url;
    const mediaType = blockTypeFromUrl(mediaUrl);

    if (mediaType === 'document') {
      blocks.push({
        id: nextBlockId(),
        type: 'document',
        url: mediaUrl,
        filename: filenameFromUrl(mediaUrl),
        delay: LEGACY_MEDIA_DELAY,
      });
    } else if (mediaType === 'video') {
      blocks.push({ id: nextBlockId(), type: 'video', url: mediaUrl, delay: LEGACY_MEDIA_DELAY });
    } else {
      blocks.push({ id: nextBlockId(), type: 'image', url: mediaUrl, delay: LEGACY_MEDIA_DELAY });
    }
  }

  return blocks;
}

/** Crea un bloque nuevo con la pausa por defecto, listo para agregarse a la secuencia. */
export function createTextBlock(): EditorBlock {
  return { id: nextBlockId(), type: 'text', content: '', delay: DEFAULT_BLOCK_DELAY };
}

export function createImageBlock(url: string, caption?: string): EditorBlock {
  return { id: nextBlockId(), type: 'image', url, caption, delay: DEFAULT_BLOCK_DELAY };
}

export function createVideoBlock(url: string, caption?: string): EditorBlock {
  return { id: nextBlockId(), type: 'video', url, caption, delay: DEFAULT_BLOCK_DELAY };
}

export function createDocumentBlock(url: string, filename: string, caption?: string): EditorBlock {
  return { id: nextBlockId(), type: 'document', url, filename, caption, delay: DEFAULT_BLOCK_DELAY };
}

/**
 * Crea el bloque adecuado para una URL de MediaLibrary, derivando el tipo de
 * la extensión del archivo en lugar de confiar en el botón que abrió la
 * biblioteca (una imagen elegida bajo "Documento" debe seguir siendo un
 * bloque de imagen).
 */
export function createBlockFromUrl(url: string): EditorBlock {
  const type = blockTypeFromUrl(url);
  if (type === 'image') return createImageBlock(url);
  if (type === 'video') return createVideoBlock(url);
  return createDocumentBlock(url, filenameFromUrl(url));
}

/**
 * Deriva el tipo de bloque de media a partir del tipo MIME de un archivo subido.
 * Devuelve `null` si el tipo MIME no corresponde a ningún bloque soportado.
 */
export function blockTypeFromMimeType(mimeType: string): 'image' | 'video' | 'document' | null {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (
    mimeType === 'application/pdf' ||
    mimeType === 'application/msword' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'document';
  }
  return null;
}

/**
 * Valida el contenido de un bloque según su tipo. Devuelve el mensaje de error
 * si es inválido, o `null` si el bloque puede guardarse.
 */
export function validateBlockContent(block: EditorBlock): string | null {
  switch (block.type) {
    case 'text':
      return block.content.trim() ? null : 'El bloque de texto no puede estar vacío.';
    case 'image':
    case 'video':
      return block.url ? null : 'Falta el archivo de este bloque.';
    case 'document':
      return block.url ? null : 'Falta el archivo de este bloque.';
    default:
      return null;
  }
}

/** Serializa la lista de bloques del editor al `FragmentedResponse` que persiste el runtime. */
export function blocksToFragmentedResponse(blocks: EditorBlock[]): FragmentedResponse {
  return {
    fragments: blocks.map(({ id, ...fragment }) => fragment as MessageFragment),
  };
}

/** Forma mínima de una escritura a `bot_responses`, común a los repos cliente y servidor. */
export interface ResponseWriteInput {
  message_text?: unknown;
  media_url?: string | null;
  response_type?: string;
}

/**
 * Fuerza `response_type = 'fragmented'` y `media_url = NULL` cuando `message_text`
 * es un objeto (`FragmentedResponse`), sin importar lo que haya enviado el
 * llamador. El editor de bloques siempre escribe en formato fragmentado; esta
 * normalización evita que un error de composición en la interfaz deje una
 * fila inconsistente con `response_type = 'simple'` y `message_text` = objeto,
 * que ninguna ruta de lectura de `conversation.repository.ts` sabe interpretar.
 * El constraint `message_text_or_media_required` sigue satisfecho porque
 * `message_text` nunca es NULL en este camino.
 *
 * Vive aquí, no en cada repositorio, porque los repos cliente y servidor deben
 * aplicar exactamente la misma regla al escribir `bot_responses`; que existiera
 * por separado en cada uno fue lo que permitió que divergieran.
 */
export function normalizeResponseWrite<T extends ResponseWriteInput>(data: T): T {
  if (data.message_text && typeof data.message_text === 'object') {
    return { ...data, response_type: 'fragmented', media_url: null };
  }
  return data;
}
