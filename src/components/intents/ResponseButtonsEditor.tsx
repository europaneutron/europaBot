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
  /**
   * A que fraccionamiento mueve el foco. Vacio = el alcance donde ya esta la
   * conversacion, que es lo normal. Con valor, el boton cambia el foco: "¿te
   * platico de Europa?" lleva a Europa y contesta ahi.
   */
  scopeId?: string | null;
}

export interface ButtonTarget {
  intentName: string;
  label: string;
  /** Null cuando la pregunta es de este alcance; el nombre del ancestro si no. */
  inheritedFrom?: string | null;
  /** Falso cuando nadie la contesta: el lead tocaria y no recibiria nada. */
  hasResponse?: boolean;
}

/** Valor del desplegable para "no mover el foco": no es un alcance. */
const CURRENT_SCOPE = '__current__';

/** El límite de WhatsApp para botones de respuesta y para su etiqueta. */
export const MAX_BUTTONS = 3;
export const MAX_BUTTON_LABEL = 20;

export interface ButtonDestination {
  id: string;
  name: string;
  isCurrent: boolean;
}

interface ResponseButtonsEditorProps {
  buttons: ResponseButtonDraft[];
  onChange: (buttons: ResponseButtonDraft[]) => void;
  /** Que preguntas alcanza cada destino. La herencia depende del destino. */
  targetsByScope: Record<string, ButtonTarget[]>;
  destinations: ButtonDestination[];
  /** El alcance donde se escribe la respuesta, que es el destino por omision. */
  currentScopeId: string;
  disabled?: boolean;
}

export function ResponseButtonsEditor({
  buttons,
  onChange,
  targetsByScope,
  destinations,
  currentScopeId,
  disabled,
}: ResponseButtonsEditorProps) {
  function update(index: number, patch: Partial<ResponseButtonDraft>) {
    onChange(buttons.map((button, position) => (
      position === index ? { ...button, ...patch } : button
    )));
  }

  function add() {
    const here = targetsByScope[currentScopeId] || [];
    const used = new Set(buttons.filter(b => !b.scopeId).map(button => button.intentName));
    const next = here.find(target => !used.has(target.intentName));
    onChange([...buttons, {
      label: next?.label.slice(0, MAX_BUTTON_LABEL) || '',
      intentName: next?.intentName || '',
      scopeId: null,
    }]);
  }

  const here = targetsByScope[currentScopeId] || [];

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div>
        <Label>Botones</Label>
        <p className="text-xs text-muted-foreground">
          Hasta {MAX_BUTTONS}. Van pegados al ultimo mensaje. Cada uno puede contestar donde ya
          este la conversacion, o llevarla a otro fraccionamiento y contestar alli. Si no pones
          ninguno, el sistema los compone solo.
        </p>
      </div>

      {buttons.map((button, index) => {
        // Lo alcanzable depende del destino, no de donde se escribe: un boton
        // que mueve el foco a Europa puede contestar lo de Europa, aunque esta
        // respuesta viva en Malasia.
        const destinationId = button.scopeId || currentScopeId;
        const targets = targetsByScope[destinationId] || [];
        const tooLong = button.label.trim().length > MAX_BUTTON_LABEL;
        const duplicated = buttons.some((other, position) => (
          position !== index
          && other.intentName
          && other.intentName === button.intentName
          && (other.scopeId || currentScopeId) === destinationId
        ));
        const chosen = targets.find(target => target.intentName === button.intentName);
        const movesFocus = Boolean(button.scopeId) && button.scopeId !== currentScopeId;
        const destinationName = destinations.find(item => item.id === destinationId)?.name;

        return (
          <div key={index} className="space-y-1 rounded-md border p-2">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={button.label}
                onChange={event => update(index, { label: event.target.value })}
                placeholder="Amenidades"
                disabled={disabled}
                aria-label={`Texto del boton ${index + 1}`}
                className="sm:max-w-44"
              />
              <Select
                value={button.scopeId || CURRENT_SCOPE}
                onValueChange={value => update(index, {
                  scopeId: value === CURRENT_SCOPE ? null : value,
                  // La pregunta elegida puede no existir en el destino nuevo:
                  // se limpia en vez de dejar un boton que lleva a otra cosa.
                  intentName: (targetsByScope[value === CURRENT_SCOPE ? currentScopeId : value] || [])
                    .some(target => target.intentName === button.intentName)
                    ? button.intentName
                    : '',
                })}
                disabled={disabled}
              >
                <SelectTrigger className="sm:max-w-48" aria-label={`Fraccionamiento del boton ${index + 1}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CURRENT_SCOPE}>Donde ya este</SelectItem>
                  {destinations.filter(item => !item.isCurrent).map(item => (
                    <SelectItem key={item.id} value={item.id}>Ir a {item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={button.intentName}
                onValueChange={intentName => update(index, { intentName })}
                disabled={disabled}
              >
                <SelectTrigger className="flex-1" aria-label={`Que contesta el boton ${index + 1}`}>
                  <SelectValue placeholder="¿Que contesta al tocarlo?" />
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
                aria-label={`Quitar el boton ${index + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {movesFocus ? (
              <p className="text-xs text-muted-foreground">
                Al tocarlo, la conversacion pasa a {destinationName} y sigue ahi.
              </p>
            ) : null}
            {tooLong ? (
              <p className="text-xs text-destructive">
                {button.label.trim().length} caracteres: WhatsApp corta en {MAX_BUTTON_LABEL}.
              </p>
            ) : null}
            {duplicated ? (
              <p className="text-xs text-destructive">
                Otro boton lleva al mismo sitio.
              </p>
            ) : null}
            {chosen && chosen.hasResponse === false ? (
              <p className="text-xs text-destructive">
                {chosen.label} no tiene respuesta todavia: quien toque este boton no recibira nada.
              </p>
            ) : null}
            {button.intentName && !chosen ? (
              <p className="text-xs text-destructive">
                Elige que contesta: {destinationName} no alcanza la pregunta que tenia.
              </p>
            ) : null}
          </div>
        );
      })}

      {buttons.length < MAX_BUTTONS ? (
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={disabled || here.length === 0}>
          <Plus className="mr-1 h-4 w-4" />
          Agregar botón
        </Button>
      ) : null}

      {here.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Todavia no hay otras preguntas que este alcance alcance. Para encadenar con las de otro
          fraccionamiento, el boton tiene que llevar alli: sin mover el foco, el bot no sabria
          resolverlas y contestaria otra cosa.
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
      scopeId: button.scopeId || null,
    }));
  return clean.length > 0 ? clean : null;
}
