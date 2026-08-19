/**
 * Vista previa de la secuencia de bloques como burbujas de WhatsApp.
 * Es una representación local aproximada: no llama a WhatsApp ni al backend,
 * y se recalcula automáticamente al cambiar el estado del editor.
 *
 * Muestra las pausas entre burbujas porque el ritmo de envío es parte de lo
 * que se está componiendo y de otro modo permanece invisible hasta producción.
 */

'use client';

import { EditorBlock } from '@/lib/utils/response-blocks';
import { FileText, Clock } from 'lucide-react';
import { interpolateMessage, type MessageVariables } from '@/lib/interpolate-message';

interface ResponsePreviewProps {
  blocks: EditorBlock[];
  variables?: MessageVariables;
}

function formatDelay(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
}

export default function ResponsePreview({ blocks, variables = {} }: ResponsePreviewProps) {
  if (blocks.length === 0) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center rounded-lg border border-dashed">
        <p className="px-6 text-center text-sm text-muted-foreground">
          Agrega bloques para ver cómo los recibirá el lead.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1 rounded-lg bg-[#e5ddd5] p-4 dark:bg-muted">
      {blocks.map((block) => {
        const textInterpolation = block.type === 'text'
          ? interpolateMessage(block.content, variables)
          : null;
        const captionInterpolation = 'caption' in block && block.caption
          ? interpolateMessage(block.caption, variables)
          : null;
        return (
        <div key={block.id}>
          {block.delay > 0 && (
            <div className="flex items-center justify-center py-1.5">
              <span className="flex items-center gap-1 rounded-full bg-black/5 px-2 py-0.5 text-[11px] text-black/50 dark:bg-white/10 dark:text-muted-foreground">
                <Clock className="h-2.5 w-2.5" />
                {formatDelay(block.delay)}
              </span>
            </div>
          )}

          <div className="flex justify-start">
            <div className="max-w-[85%] space-y-1 rounded-lg rounded-tl-sm bg-white px-3 py-2 shadow-sm dark:bg-background">
              {block.type === 'text' && (
                <p className={`whitespace-pre-wrap break-words text-sm ${textInterpolation && !textInterpolation.complete ? 'text-destructive' : ''}`}>
                  {textInterpolation?.value || <span className="italic text-muted-foreground">(vacío)</span>}
                </p>
              )}

              {block.type === 'image' && (
                <>
                  {block.url ? (
                    <img src={block.url} alt="" className="max-h-48 rounded object-cover" />
                  ) : (
                    <p className="text-sm italic text-muted-foreground">(sin archivo)</p>
                  )}
                  {captionInterpolation && <p className="break-words text-sm">{captionInterpolation.value}</p>}
                </>
              )}

              {block.type === 'video' && (
                <>
                  {block.url ? (
                    <video src={block.url} controls className="max-h-48 rounded" />
                  ) : (
                    <p className="text-sm italic text-muted-foreground">(sin archivo)</p>
                  )}
                  {captionInterpolation && <p className="break-words text-sm">{captionInterpolation.value}</p>}
                </>
              )}

              {block.type === 'document' && (
                <>
                  <div className="flex items-center gap-2 rounded bg-black/5 p-2 text-sm dark:bg-white/5">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{block.filename || '(sin archivo)'}</span>
                  </div>
                  {captionInterpolation && <p className="break-words text-sm">{captionInterpolation.value}</p>}
                </>
              )}
            </div>
          </div>
        </div>
        );
      })}
    </div>
  );
}
