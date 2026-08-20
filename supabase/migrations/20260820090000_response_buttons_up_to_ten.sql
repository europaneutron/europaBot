-- ============================================
-- MIGRACIÓN: hasta diez botones, y una descripción opcional
-- Fecha: 2026-08-20
-- Objetivo: que una respuesta escrita a mano pueda declarar hasta diez
-- opciones en vez de tres, y que el bot las mande como lista interactiva
-- cuando pasan de tres -- exactamente lo que ya hace la desambiguación
-- automática, que decide el formato solo contando cuántas opciones hay.
--
-- No hace falta un interruptor ni una columna nueva para "modo lista":
-- `currentOfferPresentation` ya elige el formato por la cantidad de
-- opciones vivas, venga de donde venga esa cantidad. Lo único que impedía
-- que las opciones escritas a mano llegaran a ser una lista era este tope de
-- tres, puesto aquí mismo.
--
-- Aditiva: solo se amplía el rango que el CHECK permite (de 1-3 a 1-10) y se
-- añade una descripción opcional por botón. Ninguna fila existente deja de
-- cumplir la restricción nueva.
-- ============================================

CREATE OR REPLACE FUNCTION public.response_buttons_are_valid(buttons JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT buttons IS NULL
    OR (
      jsonb_typeof(buttons) = 'array'
      AND jsonb_array_length(buttons) BETWEEN 1 AND 10
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(buttons) AS button
        WHERE jsonb_typeof(button) <> 'object'
           OR button->>'label' IS NULL
           OR button->>'intentName' IS NULL
           OR length(trim(button->>'label')) = 0
           -- 24, no 20: es el limite mas permisivo de los dos formatos
           -- posibles (fila de lista). Con tres o menos, el envio usa el
           -- limite de boton (20) y recorta en caliente si hiciera falta --
           -- ver labelFor en pending-offer-messages.ts -- para no bloquear
           -- aqui una etiqueta que es valida en el otro formato.
           OR length(button->>'label') > 24
           OR length(trim(button->>'intentName')) = 0
           -- La descripcion solo la usa una fila de lista (formato de 4 a
           -- 10); con tres o menos se ignora. WhatsApp la corta en 72.
           OR (button->>'description' IS NOT NULL AND length(button->>'description') > 72)
      )
    );
$$;

COMMENT ON COLUMN public.bot_responses.buttons IS
  'Opciones declaradas por quien escribe la respuesta: [{"label","intentName","scopeId","description"}]. Hasta diez. Con tres o menos se manda como botones de WhatsApp; con cuatro o más, como lista (la descripción solo se ve ahí). NULL deja que el sistema las componga. "cita" abre el flujo de agendamiento.';
