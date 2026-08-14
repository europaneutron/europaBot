/**
 * Bloque individual del editor de respuestas.
 * Un bloque equivale a un MessageFragment: edita su contenido según el tipo,
 * su pausa, y expone las acciones de eliminar y mover.
 *
 * La densidad importa: una respuesta admite hasta seis bloques y el editor
 * comparte pantalla con la vista previa, así que los controles secundarios
 * (pausa, descripción) van en la cabecera o sin etiqueta visible en lugar de
 * apilarse como campos de formulario.
 */

'use client';

import type { ComponentType } from 'react';
import { EditorBlock } from '@/lib/utils/response-blocks';
import { BLOCK_DELAY_OPTIONS } from '@/lib/constants/response-composer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  GripVertical,
  Trash2,
  ChevronUp,
  ChevronDown,
  ImageIcon,
  Video,
  FileText,
  Type,
  Clock,
} from 'lucide-react';

const BLOCK_TYPE_LABEL: Record<EditorBlock['type'], string> = {
  text: 'Texto',
  image: 'Imagen',
  video: 'Video',
  document: 'Documento',
  location: 'Ubicación',
  audio: 'Audio',
  contact: 'Contacto',
};

const BLOCK_TYPE_ICON: Record<string, ComponentType<{ className?: string }>> = {
  text: Type,
  image: ImageIcon,
  video: Video,
  document: FileText,
};

interface ResponseBlockItemProps {
  block: EditorBlock;
  index: number;
  total: number;
  error?: string;
  disabled?: boolean;
  controlsDisabled?: boolean;
  onChange: (block: EditorBlock) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

/** Nombre legible del archivo de un bloque de media, para no mostrar la URL cruda. */
function mediaLabel(block: EditorBlock): string {
  if (block.type === 'document') return block.filename || 'Sin archivo';
  if (block.type === 'image' || block.type === 'video') {
    if (!block.url) return 'Sin archivo';
    return decodeURIComponent(block.url.split('?')[0].split('/').pop() || 'archivo');
  }
  return '';
}

export default function ResponseBlockItem({
  block,
  index,
  total,
  error,
  disabled,
  controlsDisabled,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: ResponseBlockItemProps) {
  const Icon = BLOCK_TYPE_ICON[block.type] ?? FileText;
  const isMedia = block.type === 'image' || block.type === 'video' || block.type === 'document';
  const hasCustomDelay = !BLOCK_DELAY_OPTIONS.some((option) => option.value === block.delay);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver();
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files.length === 0) {
          e.preventDefault();
          onDrop();
        }
      }}
      className={`group rounded-lg border bg-card transition-colors ${
        error ? 'border-destructive' : 'hover:border-foreground/20'
      }`}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        {/* El arrastre se inicia solo desde el asa, no desde toda la tarjeta:
            si no, seleccionar texto con el mouse dentro de un input o
            textarea del bloque se interpreta como el inicio de un drag. */}
        <button
          type="button"
          draggable={!disabled && !controlsDisabled}
          disabled={disabled || controlsDisabled}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'move';
            onDragStart();
          }}
          onDragEnd={onDragEnd}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              onMoveUp();
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              onMoveDown();
            }
          }}
          className="cursor-grab rounded text-muted-foreground/60 transition-colors hover:text-foreground touch-none disabled:cursor-not-allowed"
          title="Arrastrar para reordenar"
          aria-label={`Reordenar bloque ${index + 1}. Usa flecha arriba o abajo.`}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <span className="text-xs font-medium tabular-nums text-muted-foreground">{index + 1}</span>

        <Badge variant="secondary" className="gap-1 font-normal">
          <Icon className="h-3 w-3" />
          {BLOCK_TYPE_LABEL[block.type]}
        </Badge>

        <div className="ml-auto flex items-center gap-1">
          <Select
            value={String(block.delay)}
            onValueChange={(value) => onChange({ ...block, delay: Number(value) })}
            disabled={disabled}
          >
            <SelectTrigger
              className="h-7 w-auto gap-1 border-none bg-transparent px-2 text-xs text-muted-foreground shadow-none hover:bg-muted focus:ring-0"
              aria-label={`Pausa antes del bloque ${index + 1}`}
              title="Pausa antes de este bloque"
            >
              <Clock className="h-3 w-3" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {hasCustomDelay && (
                <SelectItem value={String(block.delay)}>Heredado ({block.delay} ms)</SelectItem>
              )}
              {BLOCK_DELAY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>
                  {option.label} ({option.value} ms)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center opacity-60 transition-opacity group-hover:opacity-100">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={disabled || controlsDisabled || index === 0}
              onClick={onMoveUp}
              title="Mover arriba"
              aria-label={`Mover bloque ${index + 1} arriba`}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={disabled || controlsDisabled || index === total - 1}
              onClick={onMoveDown}
              title="Mover abajo"
              aria-label={`Mover bloque ${index + 1} abajo`}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              disabled={disabled || controlsDisabled}
              onClick={onRemove}
              title="Eliminar bloque"
              aria-label={`Eliminar bloque ${index + 1}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-2 p-3">
        {block.type === 'text' && (
          <Textarea
            id={`block-content-${block.id}`}
            value={block.content}
            onChange={(e) => onChange({ ...block, content: e.target.value })}
            placeholder="Escribe el texto de este mensaje..."
            rows={3}
            disabled={disabled}
            aria-label={`Contenido del bloque ${index + 1}`}
            className="resize-y"
          />
        )}

        {isMedia && (
          <div className="flex items-center gap-3 rounded-md border bg-muted/40 p-2">
            {block.type === 'image' && block.url ? (
              <img
                src={block.url}
                alt=""
                className="h-12 w-12 shrink-0 rounded border object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded border bg-background">
                <Icon className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
            <p
              className="min-w-0 flex-1 truncate text-sm"
              title={block.type === 'document' ? block.filename : block.url}
            >
              {mediaLabel(block)}
            </p>
          </div>
        )}

        {isMedia && (
          <Input
            id={`block-caption-${block.id}`}
            value={block.caption || ''}
            onChange={(e) => onChange({ ...block, caption: e.target.value })}
            placeholder="Descripción que acompaña el archivo (opcional)"
            disabled={disabled}
            aria-label={`Descripción del bloque ${index + 1}`}
          />
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
