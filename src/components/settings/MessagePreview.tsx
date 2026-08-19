/**
 * Cómo se ve un mensaje del sistema en WhatsApp, con los datos reales del
 * negocio y los botones que lleva detrás.
 *
 * La etiqueta del campo dice cuándo sale --"Cuando ya le adelantó los
 * proyectos"-- y aun así hay que reconstruir la escena en la cabeza para saber
 * qué se está escribiendo. Aquí se ve: lo que escribió el lead arriba, lo que
 * contesta el bot debajo, y los botones dibujados.
 *
 * Es una reconstrucción local: no llama al bot. Lo que enseña es el texto que
 * hay en el campo con las variables sustituidas, que es exactamente lo que el
 * runtime va a mandar.
 */

'use client';

import { interpolateMessage } from '@/lib/interpolate-message';

export interface PreviewScene {
  /** Lo que el lead acaba de escribir o tocar. */
  lead: string;
  /** Con qué se rellenan las variables de este mensaje. */
  variables: Record<string, string>;
  /** Los botones que van pegados debajo. */
  buttons?: string[];
  /** Un mensaje que sale antes que este, cuando los dos van juntos. */
  before?: string;
}

interface MessagePreviewProps {
  template: string;
  scene: PreviewScene;
}

export function MessagePreview({ template, scene }: MessagePreviewProps) {
  const rendered = interpolateMessage(template, scene.variables);

  return (
    <div className="space-y-1 rounded-lg bg-[#e5ddd5] p-3 dark:bg-muted">
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-lg rounded-tr-sm bg-[#d9fdd3] px-3 py-1.5 text-sm text-black shadow-sm dark:bg-emerald-900 dark:text-emerald-50">
          {scene.lead}
        </div>
      </div>

      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-lg rounded-tl-sm bg-white px-3 py-2 text-sm shadow-sm dark:bg-background">
          {scene.before ? (
            <p className="whitespace-pre-wrap break-words text-muted-foreground">{scene.before}</p>
          ) : null}
          <p className="whitespace-pre-wrap break-words">{rendered.value}</p>

          {scene.buttons?.length ? (
            <div className="-mx-3 -mb-2 mt-2 divide-y border-t">
              {scene.buttons.map(button => (
                <div key={button} className="px-3 py-1.5 text-center text-[#00a5f4]">
                  {button}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {!rendered.complete ? (
        <p className="pt-1 text-xs text-destructive">
          {rendered.missingKeys.map(key => `{${key}}`).join(', ')} no existe aquí: si lo dejas, el
          bot manda el texto de fábrica en su lugar.
        </p>
      ) : null}
    </div>
  );
}
