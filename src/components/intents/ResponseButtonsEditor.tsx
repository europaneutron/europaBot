/**
 * Los botones que acompañan a una respuesta.
 *
 * No es un bloque arrastrable como el texto o una imagen, y es a propósito:
 * en WhatsApp los botones no son un mensaje, son algo que cuelga del último.
 * Ponerlos en medio de la secuencia prometería un orden que el transporte no
 * puede cumplir.
 *
 * Cada botón encadena con una pregunta que ya existe, o con el flujo de cita.
 * Al tocarlo, el bot resuelve esa pregunta en el mismo alcance, sin pasar por
 * el matcher: por eso solo se ofrecen preguntas vivas y no texto libre.
 */

'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';

export interface ResponseButtonDraft {
  label: string;
  intentName: string;
}

export interface ButtonTarget {
  intentName: string;
  label: string;
  /** Null cuando la pregunta es de este alcance; el nombre del ancestro si no. */
  inheritedFrom?: string | null;
  /** Falso cuando nadie la contesta: el lead tocaria y no recibiria nada. */
  hasResponse?: boolean;
}

/** El límite de WhatsApp para botones de respuesta y para su etiqueta. */
export const MAX_BUTTONS = 3;
export const MAX_BUTTON_LABEL = 20;

interface ResponseButtonsEditorProps {
  buttons: ResponseButtonDraft[];
  onChange: (buttons: ResponseButtonDraft[]) => void;
  targets: ButtonTarget[];
  disabled?: boolean;
}

export function ResponseButtonsEditor({
  buttons,
  onChange,
  targets,
  disabled,
}: ResponseButtonsEditorProps) {
  function update(index: number, patch: Partial<ResponseButtonDraft>) {
    onChange(buttons.map((button, position) => (
      position === index ? { ...button, ...patch } : button
    )));
  }

  function add() {
    const used = new Set(buttons.map(button => button.intentName));
    const next = targets.find(target => !used.has(target.intentName));
    onChange([...buttons, { label: next?.label.slice(0, MAX_BUTTON_LABEL) || '', intentName: next?.intentName || '' }]);
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div>
        <Label>Botones</Label>
        <p className="text-xs text-muted-foreground">
          Hasta {MAX_BUTTONS}. Van pegados al último mensaje de la respuesta y al tocarlos el bot
          contesta esa pregunta. Si no pones ninguno, el sistema los compone solo.
        </p>
      </div>

      {buttons.map((button, index) => {
        const tooLong = button.label.trim().length > MAX_BUTTON_LABEL;
        const duplicated = buttons.some((other, position) => (
          position !== index && other.intentName && other.intentName === button.intentName
        ));
        const chosen = targets.find(target => target.intentName === button.intentName);
        return (
          <div key={index} className="space-y-1">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={button.label}
                onChange={event => update(index, { label: event.target.value })}
                placeholder="Amenidades"
                disabled={disabled}
                aria-label={`Texto del botón ${index + 1}`}
                className="sm:max-w-48"
              />
              <Select
                value={button.intentName}
                onValueChange={intentName => update(index, { intentName })}
                disabled={disabled}
              >
                <SelectTrigger className="flex-1" aria-label={`Destino del botón ${index + 1}`}>
                  <SelectValue placeholder="¿Qué contesta al tocarlo?" />
                </SelectTrigger>
                <SelectContent>
                  {targets.map(target => (
                    <SelectItem key={target.intentName} value={target.intentName}>
                      <span className="flex items-center gap-2">
                        {target.label}
                        <span className="text-xs text-muted-foreground">
                          {target.inheritedFrom ? `hereda de ${target.inheritedFrom}` : 'propia'}
                          {target.hasResponse === false ? ' · sin respuesta' : ''}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled}
                onClick={() => onChange(buttons.filter((_, position) => position !== index))}
                aria-label={`Quitar el botón ${index + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            {tooLong ? (
              <p className="text-xs text-destructive">
                {button.label.trim().length} caracteres: WhatsApp corta en {MAX_BUTTON_LABEL}.
              </p>
            ) : null}
            {duplicated ? (
              <p className="text-xs text-destructive">
                Otro botón lleva al mismo sitio.
              </p>
            ) : null}
            {chosen && chosen.hasResponse === false ? (
              <p className="text-xs text-destructive">
                {chosen.label} no tiene respuesta todavía: quien toque este botón no recibirá nada.
              </p>
            ) : null}
          </div>
        );
      })}

      {buttons.length < MAX_BUTTONS ? (
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={disabled || targets.length === 0}>
          <Plus className="mr-1 h-4 w-4" />
          Agregar botón
        </Button>
      ) : null}

      {targets.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Todavía no hay otras preguntas que este alcance alcance. Solo se puede encadenar con lo
          suyo y con lo del negocio, nunca con lo de otro fraccionamiento: el bot no sabría
          resolverlo y contestaría otra cosa.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Lo que sobrevive al guardar: un botón sin destino no es un botón, y una
 * etiqueta vacía deja un rectángulo mudo. `null` cuando no queda ninguno,
 * porque es lo que significa "que los componga el sistema".
 */
export function cleanButtons(buttons: ResponseButtonDraft[]): ResponseButtonDraft[] | null {
  const clean = buttons
    .filter(button => button.label.trim() && button.intentName.trim())
    .slice(0, MAX_BUTTONS)
    .map(button => ({
      label: button.label.trim().slice(0, MAX_BUTTON_LABEL),
      intentName: button.intentName.trim(),
    }));
  return clean.length > 0 ? clean : null;
}
