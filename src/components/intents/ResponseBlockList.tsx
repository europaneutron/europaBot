/**
 * Editor de la secuencia de bloques de una respuesta.
 * Orquesta alta, baja, reordenamiento, adjuntos y el presupuesto de tiempo
 * de envío; delega la edición de cada bloque a ResponseBlockItem.
 *
 * La zona de arrastre no ocupa espacio permanente: la lista completa es el
 * destino y solo se destaca mientras se arrastra o cuando no hay bloques.
 * Con hasta seis bloques en pantalla, cada panel fijo compite con el contenido.
 */

'use client';

import { useEffect, useMemo, useRef, useState, type Dispatch, type DragEvent, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import {
  EditorBlock,
  createTextBlock,
  createImageBlock,
  createVideoBlock,
  createDocumentBlock,
  createBlockFromUrl,
  blockTypeFromMimeType,
  validateBlockContent,
} from '@/lib/utils/response-blocks';
import {
  MAX_RESPONSE_BLOCKS,
  RESPONSE_TIME_WARNING_THRESHOLD_MS,
  estimateSendTimeMs,
} from '@/lib/constants/response-composer';
import { uploadMediaFiles } from '@/services/storage/media-upload';
import ResponseBlockItem from './ResponseBlockItem';
import MediaLibrary from '@/components/admin/MediaLibrary';
import { Button } from '@/components/ui/button';
import { ImageIcon, Video, FileText, Type, Loader2, AlertTriangle, Clock, Upload } from 'lucide-react';

interface ResponseBlockListProps {
  blocks: EditorBlock[];
  onChange: Dispatch<SetStateAction<EditorBlock[]>>;
  disabled?: boolean;
  /** Errores por id de bloque, calculados por el llamador al intentar guardar. */
  blockErrors?: Record<string, string>;
}

export default function ResponseBlockList({ blocks, onChange, disabled, blockErrors }: ResponseBlockListProps) {
  const [showMediaLibrary, setShowMediaLibrary] = useState<'image' | 'video' | 'document' | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [dragOverList, setDragOverList] = useState(false);
  const dragIndexRef = useRef<number | null>(null);

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  const atLimit = blocks.length >= MAX_RESPONSE_BLOCKS;
  const controlsDisabled = disabled || uploading;

  const estimatedTimeMs = useMemo(
    () => estimateSendTimeMs(blocks.map((block) => block.delay)),
    [blocks]
  );
  const showTimeWarning = estimatedTimeMs > RESPONSE_TIME_WARNING_THRESHOLD_MS;

  function updateBlock(index: number, block: EditorBlock) {
    onChange((current) => current.map((item, currentIndex) => currentIndex === index ? block : item));
  }

  function removeBlock(index: number) {
    onChange((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function moveBlock(from: number, to: number) {
    if (to < 0 || to >= blocks.length) return;
    onChange((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function addBlock(block: EditorBlock) {
    if (blocks.length >= MAX_RESPONSE_BLOCKS) return;
    onChange((current) => current.length >= MAX_RESPONSE_BLOCKS ? current : [...current, block]);
  }

  function addBlocksFromUrls(urls: string[]) {
    const remaining = MAX_RESPONSE_BLOCKS - blocks.length;
    const usable = urls.slice(0, remaining);
    // El tipo de cada bloque se deriva de la extensión del propio archivo,
    // no del botón que abrió la biblioteca: elegir una imagen bajo el botón
    // "Documento" debe seguir produciendo un bloque de imagen.
    const newBlocks = usable.map((url) => createBlockFromUrl(url));

    onChange((current) => [...current, ...newBlocks].slice(0, MAX_RESPONSE_BLOCKS));

    if (urls.length > usable.length) {
      setUploadErrors([
        `Se agregaron ${usable.length} de ${urls.length} archivo(s); máximo ${MAX_RESPONSE_BLOCKS} bloques por respuesta.`,
      ]);
    } else {
      setUploadErrors([]);
    }
  }

  async function handleFilesSelected(files: FileList | File[]) {
    if (uploading) return;

    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const remaining = MAX_RESPONSE_BLOCKS - blocks.length;
    if (remaining <= 0) {
      setUploadErrors([`Ya se alcanzó el máximo de ${MAX_RESPONSE_BLOCKS} bloques por respuesta.`]);
      return;
    }

    setUploading(true);
    setUploadErrors([]);

    try {
      const usable = fileArray.slice(0, remaining);
      const { uploaded, errors } = await uploadMediaFiles(usable);

      if (fileArray.length > usable.length) {
        errors.push(
          `Se subieron ${usable.length} de ${fileArray.length} archivo(s); máximo ${MAX_RESPONSE_BLOCKS} bloques por respuesta.`
        );
      }

      const newBlocks: EditorBlock[] = [];
      for (const file of uploaded) {
        const blockType = blockTypeFromMimeType(file.mimeType);
        if (!blockType) {
          errors.push(`Tipo de archivo no permitido: "${file.filename}".`);
          continue;
        }
        if (blockType === 'image') newBlocks.push(createImageBlock(file.url));
        else if (blockType === 'video') newBlocks.push(createVideoBlock(file.url));
        else newBlocks.push(createDocumentBlock(file.url, file.filename));
      }

      if (newBlocks.length > 0) {
        onChange((current) => [...current, ...newBlocks].slice(0, MAX_RESPONSE_BLOCKS));
      }
      setUploadErrors(errors);
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOverList(false);
    // Un arrastre de bloques en curso (reordenamiento) no debe interpretarse
    // como si se estuvieran soltando archivos.
    if (disabled || atLimit || uploading) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  }

  /** Solo destaca la zona de soltado cuando lo que se arrastra son archivos. */
  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (dragIndexRef.current === null && !controlsDisabled && !atLimit) {
      setDragOverList(true);
    }
  }

  const addButtons = [
    { type: 'text' as const, label: 'Texto', icon: Type, onClick: () => addBlock(createTextBlock()) },
    { type: 'image' as const, label: 'Imagen', icon: ImageIcon, onClick: () => setShowMediaLibrary('image') },
    { type: 'video' as const, label: 'Video', icon: Video, onClick: () => setShowMediaLibrary('video') },
    { type: 'document' as const, label: 'Documento', icon: FileText, onClick: () => setShowMediaLibrary('document') },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {addButtons.map(({ type, label, icon: ButtonIcon, onClick }) => (
            <Button
              key={type}
              type="button"
              variant="outline"
              size="sm"
              disabled={controlsDisabled || atLimit}
              onClick={onClick}
            >
              <ButtonIcon className="mr-1.5 h-3.5 w-3.5" />
              {label}
            </Button>
          ))}
        </div>

        <span className="text-xs tabular-nums text-muted-foreground">
          {blocks.length} de {MAX_RESPONSE_BLOCKS} bloques
        </span>
      </div>

      {atLimit && (
        <p className="text-xs text-muted-foreground">
          Máximo alcanzado. Elimina un bloque para agregar otro.
        </p>
      )}

      {uploadErrors.length > 0 && (
        <div className="space-y-1 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {uploadErrors.map((message, i) => (
            <p key={i}>{message}</p>
          ))}
        </div>
      )}

      <div
        onDragOver={handleDragOver}
        onDragLeave={() => setDragOverList(false)}
        onDrop={handleDrop}
        className={`rounded-lg transition-colors ${
          dragOverList ? 'bg-primary/5 ring-2 ring-primary/40 ring-offset-2' : ''
        }`}
      >
        {blocks.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed py-10 text-center">
            {uploading ? (
              <span className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Subiendo archivos...
              </span>
            ) : (
              <>
                <Upload className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Agrega un bloque o arrastra archivos aquí
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {blocks.map((block, index) => (
              <ResponseBlockItem
                key={block.id}
                block={block}
                index={index}
                total={blocks.length}
                error={blockErrors?.[block.id]}
                disabled={disabled}
                controlsDisabled={controlsDisabled}
                onChange={(updated) => updateBlock(index, updated)}
                onRemove={() => removeBlock(index)}
                onMoveUp={() => moveBlock(index, index - 1)}
                onMoveDown={() => moveBlock(index, index + 1)}
                onDragStart={() => {
                  dragIndexRef.current = index;
                }}
                onDragOver={() => {}}
                onDrop={() => {
                  const from = dragIndexRef.current;
                  if (from !== null && from !== index) {
                    moveBlock(from, index);
                  }
                  dragIndexRef.current = null;
                }}
                onDragEnd={() => {
                  // dragend dispara también al cancelar (soltar fuera de un
                  // destino válido, o Esc), que es justo el caso que onDrop no cubre.
                  dragIndexRef.current = null;
                }}
              />
            ))}

            {uploading && (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Subiendo archivos...
              </div>
            )}
          </div>
        )}
      </div>

      {blocks.length > 0 && (
        <div
          className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
            showTimeWarning
              ? 'border border-amber-400 bg-amber-50 text-amber-900'
              : 'text-muted-foreground'
          }`}
        >
          {showTimeWarning ? (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : (
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          )}
          <span>
            Tiempo estimado de envío: {(estimatedTimeMs / 1000).toFixed(1)} s
            {showTimeWarning && (
              <>
                {'. '}
                Una secuencia tan larga puede hacer que Meta reintente la entrega y el lead reciba
                mensajes duplicados.
              </>
            )}
          </span>
        </div>
      )}

      {showMediaLibrary && portalTarget && createPortal(
        <MediaLibrary
          multiple
          typeFilter={showMediaLibrary}
          onSelect={() => {}}
          onSelectMultiple={(urls) => {
            addBlocksFromUrls(urls);
            setShowMediaLibrary(null);
          }}
          onClose={() => setShowMediaLibrary(null)}
        />,
        portalTarget
      )}
    </div>
  );
}

/**
 * Valida todos los bloques y devuelve los errores por id, o un objeto vacío
 * si la secuencia es válida. Uso: llamar antes de guardar.
 */
export function validateBlocks(blocks: EditorBlock[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const block of blocks) {
    const error = validateBlockContent(block);
    if (error) errors[block.id] = error;
  }
  return errors;
}
