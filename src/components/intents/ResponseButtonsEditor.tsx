/**
 * Las opciones que acompañan a una respuesta.
 *
 * No es un bloque arrastrable como el texto o una imagen, y es a propósito:
 * en WhatsApp no son un mensaje, son algo que cuelga del último. Ponerlas en
 * medio de la secuencia prometería un orden que el transporte no puede
 * cumplir.
 *
 * Cada opción encadena con una pregunta que ya existe, o con el flujo de
 * cita. Al tocarla, el bot resuelve esa pregunta en el mismo alcance, sin
 * pasar por el matcher: por eso solo se ofrecen preguntas vivas y no texto
 * libre.
 *
 * Con tres o menos, WhatsApp las manda como botones (máximo 20 caracteres
 * por título, sin descripción). Con cuatro o más, como una lista desplegable
 * (máximo 24 caracteres, con una descripción opcional debajo). No hay un
 * interruptor para elegir: lo decide sola la cantidad de opciones que haya,
 * al momento de mandar el mensaje -- es la misma regla que ya usa la
 * desambiguación automática. La descripción se escribe siempre; solo se ve
 * si la respuesta termina teniendo cuatro opciones o más.
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
  /**
   * Solo se ve si esto termina mandandose como lista (cuatro opciones o
   * mas). Con tres o menos no hay donde ponerla y se ignora.
   */
  description?: string;
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

/** Cuántas opciones admite WhatsApp como lista, que es más que como botones. */
export const MAX_OPTIONS = 10;
/** A partir de aquí, WhatsApp deja de mandarlas como botones y pasa a lista. */
const BUTTON_FORMAT_LIMIT = 3;
/** Título de un botón de WhatsApp. */
export const MAX_BUTTON_LABEL = 20;
/** Título de una fila de lista: más largo porque no comparte el cuerpo con otros dos. */
export const MAX_LIST_ROW_LABEL = 24;
/** La descripción de una fila de lista. */
export const MAX_LIST_ROW_DESCRIPTION = 72;

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

  // El formato final --botones o lista-- lo decide la cantidad total de
  // opciones al momento de mandar el mensaje, no algo que se elige aqui.
  // Con eso se sabe tambien que limite de longitud aplica a cada etiqueta:
  // corto mientras quepa en un boton, mas largo en cuanto pasa a lista.
  const willBeList = buttons.length > BUTTON_FORMAT_LIMIT;
  const labelLimit = willBeList ? MAX_LIST_ROW_LABEL : MAX_BUTTON_LABEL;

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div>
        <Label>Opciones</Label>
        <p className="text-xs text-muted-foreground">
          Hasta {MAX_OPTIONS}. Con {BUTTON_FORMAT_LIMIT} o menos, WhatsApp las manda como botones
          pegados al ultimo mensaje; con {BUTTON_FORMAT_LIMIT + 1} o mas, como una lista
          desplegable, con la descripcion visible debajo de cada una. Cada opcion puede contestar
          donde ya este la conversacion, o llevarla a otro fraccionamiento y contestar alli. Si no
          pones ninguna, el sistema las compone solo.
        </p>
        {willBeList ? (
          <p className="text-xs text-muted-foreground">
            Con {buttons.length}, esto se va a mandar como lista: los titulos caben hasta{' '}
            {MAX_LIST_ROW_LABEL} caracteres.
          </p>
        ) : null}
      </div>

      {buttons.map((button, index) => {
        // Lo alcanzable depende del destino, no de donde se escribe: un boton
        // que mueve el foco a Europa puede contestar lo de Europa, aunque esta
        // respuesta viva en Malasia.
        const destinationId = button.scopeId || currentScopeId;
        const targets = targetsByScope[destinationId] || [];
        const labelLength = button.label.trim().length;
        const tooLong = labelLength > labelLimit;
        // Cabe como fila de lista (formato actual, con 4 o mas) pero no
        // como boton: si mas tarde se borra una opcion y esto vuelve a
        // tener tres o menos, el texto se recorta sin que nadie lo haya
        // tocado. Se avisa ahora, mientras todavia cabe.
        const wouldBreakAsButtons = willBeList && !tooLong && labelLength > MAX_BUTTON_LABEL;
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

            {/* Solo llega a verse si esto se manda como lista. Con tres o
                menos se guarda igual, por si mas tarde se agregan mas
                opciones, pero no se muestra para no prometer algo que hoy no
                sale. */}
            {willBeList ? (
              <Input
                value={button.description || ''}
                onChange={event => update(index, { description: event.target.value })}
                placeholder="Descripción (opcional, se ve debajo del título)"
                disabled={disabled}
                aria-label={`Descripción de la opción ${index + 1}`}
                maxLength={MAX_LIST_ROW_DESCRIPTION}
              />
            ) : null}

            {movesFocus ? (
              <p className="text-xs text-muted-foreground">
                Al tocarlo, la conversacion pasa a {destinationName} y sigue ahi.
              </p>
            ) : null}
            {tooLong ? (
              <p className="text-xs text-destructive">
                {labelLength} caracteres: {willBeList ? 'como lista' : 'como botón'} WhatsApp corta
                en {labelLimit}.
              </p>
            ) : null}
            {!tooLong && wouldBreakAsButtons ? (
              <p className="text-xs text-muted-foreground">
                {labelLength} caracteres: cabe en la lista, pero si esto baja a {BUTTON_FORMAT_LIMIT}{' '}
                opciones o menos y pasa a botones, se recorta en {MAX_BUTTON_LABEL}.
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

      {buttons.length < MAX_OPTIONS ? (
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={disabled || here.length === 0}>
          <Plus className="mr-1 h-4 w-4" />
          Agregar opción
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
 * Lo que sobrevive al guardar: una opción sin destino no es una opción, y una
 * etiqueta vacía deja un rectángulo mudo. `null` cuando no queda ninguna,
 * porque es lo que significa "que las componga el sistema".
 *
 * La etiqueta se guarda hasta 24 caracteres --el límite más permisivo de los
 * dos formatos-- y no hasta 20: recortar aquí a lo corto le quitaría a una
 * respuesta de cuatro o más el texto que sí le cabe como fila de lista. El
 * recorte a 20 para cuando de verdad se manda como botones lo hace
 * `labelFor` al momento de enviar, que es cuando ya se sabe cuántas hay.
 */
export function cleanButtons(buttons: ResponseButtonDraft[]): ResponseButtonDraft[] | null {
  const clean = buttons
    .filter(button => button.label.trim() && button.intentName.trim())
    .slice(0, MAX_OPTIONS)
    .map(button => ({
      label: button.label.trim().slice(0, MAX_LIST_ROW_LABEL),
      intentName: button.intentName.trim(),
      scopeId: button.scopeId || null,
      description: button.description?.trim().slice(0, MAX_LIST_ROW_DESCRIPTION) || undefined,
    }));
  return clean.length > 0 ? clean : null;
}
