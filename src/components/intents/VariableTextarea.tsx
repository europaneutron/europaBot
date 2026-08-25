/**
 * El textarea del editor de respuestas, con sugerencias al escribir `{`.
 *
 * Enlazar un dato era elegirlo en un desplegable aparte y pulsar un botón, que
 * lo pegaba al final del primer bloque de texto: ni donde estaba el cursor, ni
 * necesariamente en el bloque que se estaba escribiendo. Aquí se escribe `{`
 * donde va el dato y la lista sale sola.
 *
 * Solo se ofrecen los datos que ese alcance alcanza --los suyos y los que
 * hereda-- porque son exactamente los que el runtime va a poder rellenar. Un
 * hueco que no se puede rellenar deja la respuesta sin enviar.
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';

export interface VariableOption {
  key: string;
  preview: string;
  /**
   * De donde sale el dato: null si es del propio alcance, y el nombre del
   * alcance si viene de otro sitio. Sin esto, dos datos con el mismo nombre en
   * ramas distintas son indistinguibles en la lista.
   */
  from?: string | null;
  /**
   * Falso cuando el dato vive en otro alcance que este no hereda. Se ofrece
   * igual: se escribe citando su procedencia, y entonces se resuelve venga de
   * donde venga.
   */
  reachable?: boolean;
  /** Como se escribe cuando hay que citar su procedencia: `europa.precio`. */
  qualifiedKey?: string;
}

interface VariableTextareaProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: VariableOption[];
  /**
   * Copiar un dato de un hijo a este alcance. Es la salida honesta al caso de
   * "quiero el precio desde en el negocio, y vive en los desarrollos": en vez
   * de escribir un hueco que nunca se rellena, el dato pasa a existir aqui.
   */
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  'aria-label'?: string;
  className?: string;
}

/**
 * Lo que se está escribiendo dentro de una llave todavía sin cerrar, mirando
 * solo hacia atrás desde el cursor. Si aparece un espacio, un salto o una
 * llave de cierre antes de la de apertura, no se está nombrando un dato: es
 * texto normal que casualmente lleva una llave.
 */
export function openVariableAt(text: string, caret: number): { start: number; query: string } | null {
  for (let index = caret - 1; index >= 0; index -= 1) {
    const character = text[index];
    if (character === '{') return { start: index, query: text.slice(index + 1, caret) };
    if (character === '}' || character === '\n' || character === ' ') return null;
  }
  return null;
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function VariableTextarea({
  id,
  value,
  onChange,
  options,
  placeholder,
  rows = 3,
  disabled,
  className,
  ...rest
}: VariableTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState<number | null>(null);
  const [highlighted, setHighlighted] = useState(0);

  const open = caret === null ? null : openVariableAt(value, caret);
  const matches = useMemo(() => {
    if (!open) return [];
    const query = normalize(open.query);
    return options
      // Buscar tambien contra la llave calificada: quien ya escribio
      // "europa.pre" completando a mano --o volvio a abrir una llave ya
      // calificada para editarla-- tiene que seguir encontrando la opcion,
      // no solo quien empieza desde cero.
      .filter(option => (
        normalize(option.key).includes(query)
        || (option.qualifiedKey && normalize(option.qualifiedKey).includes(query))
      ))
      // Primero lo que este alcance puede rellenar; lo de los hijos al final,
      // porque elegirlo pide una decision aparte.
      .sort((left, right) => Number(right.reachable !== false) - Number(left.reachable !== false))
      .slice(0, 8);
  }, [open, options]);

  useEffect(() => { setHighlighted(0); }, [open?.query]);

  function insert(option: VariableOption) {
    if (!open || caret === null) return;

    const before = value.slice(0, open.start);
    const after = value.slice(caret);
    // Un dato de otro alcance se escribe con su procedencia --{europa.precio}--
    // porque la herencia no lo trae hasta aqui. Lo demas va tal cual.
    const token = `{${option.reachable === false && option.qualifiedKey ? option.qualifiedKey : option.key}}`;
    onChange(`${before}${token}${after}`);

    // El cursor queda detrás de la llave de cierre para poder seguir
    // escribiendo la frase sin tocar el ratón.
    const nextCaret = before.length + token.length;
    requestAnimationFrame(() => {
      const element = textareaRef.current;
      if (!element) return;
      element.focus();
      element.setSelectionRange(nextCaret, nextCaret);
      setCaret(nextCaret);
    });
  }

  const showList = Boolean(open) && matches.length > 0;

  return (
    <div className="relative">
      <Textarea
        {...rest}
        id={id}
        ref={textareaRef}
        value={value}
        rows={rows}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
        onChange={event => {
          onChange(event.target.value);
          setCaret(event.target.selectionStart);
        }}
        onClick={event => setCaret((event.target as HTMLTextAreaElement).selectionStart)}
        onKeyUp={event => {
          // Las teclas que mueven la lista no mueven el cursor: si se leyera
          // la posición aquí, bajar por las opciones cerraría la lista.
          if (showList && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) return;
          setCaret((event.target as HTMLTextAreaElement).selectionStart);
        }}
        onBlur={() => {
          // Con retraso, porque hacer clic en una opción quita el foco antes
          // de que llegue el clic.
          setTimeout(() => setCaret(null), 150);
        }}
        onKeyDown={event => {
          if (!showList) return;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setHighlighted(current => (current + 1) % matches.length);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setHighlighted(current => (current - 1 + matches.length) % matches.length);
          } else if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault();
            insert(matches[highlighted]);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            setCaret(null);
          }
        }}
      />

      {showList ? (
        <ul
          role="listbox"
          aria-label="Datos del catálogo"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md"
        >
          {matches.map((option, index) => (
            <li key={option.qualifiedKey || option.key}>
              <button
                type="button"
                role="option"
                aria-selected={index === highlighted}
                className={`flex w-full items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-left text-sm ${
                  index === highlighted ? 'bg-accent text-accent-foreground' : ''
                }`}
                onMouseEnter={() => setHighlighted(index)}
                onMouseDown={event => event.preventDefault()}
                onClick={() => insert(option)}
              >
                {/* Calificada cuando la hay: dos hijos con el mismo nombre de
                    dato ("precio" en Europa y en Malasia) se ven identicos
                    si aqui se ensena solo la llave a secas. */}
                <code className="shrink-0">{option.qualifiedKey || option.key}</code>
                <span className="truncate text-muted-foreground">{option.preview}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {option.reachable === false
                    ? `de ${option.from}`
                    : option.from
                      ? `hereda de ${option.from}`
                      : 'propio'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {open && matches.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Ningún dato de este alcance se llama así. Créalo en Catálogo o revisa el nombre.
        </p>
      ) : null}
    </div>
  );
}
