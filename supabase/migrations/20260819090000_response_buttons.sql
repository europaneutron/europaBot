-- ============================================
-- MIGRACIÓN: una respuesta puede llevar sus propios botones
-- Fecha: 2026-08-19
-- Objetivo: que quien escribe la respuesta decida el paso siguiente, en vez
-- de dejarlo siempre en manos de lo que el sistema compone.
--
-- El mecanismo ya existe: la sesión guarda `pending_offer_options` y un toque
-- llega como identificador `intent:<pregunta>:<alcance>`, que se resuelve sin
-- pasar por el matcher. Lo que faltaba era poder declararlos a mano.
--
-- Aditiva: `NULL` significa "los compone el sistema", que es lo que hacen hoy
-- todas las respuestas. Producción puede aplicarla sin ventana.
-- ============================================

ALTER TABLE public.bot_responses
  ADD COLUMN buttons JSONB;

COMMENT ON COLUMN public.bot_responses.buttons IS
  'Botones declarados por quien escribió la respuesta: [{"label":"Amenidades","intentName":"amenidades"}]. Hasta tres. NULL deja que el sistema los componga. "cita" abre el flujo de agendamiento.';

-- Tres es el límite de WhatsApp para botones de respuesta, y una etiqueta no
-- puede pasar de veinte caracteres. Se comprueba aquí para que no dependa de
-- que la pantalla lo recuerde: una respuesta con cuatro botones no se puede
-- enviar, y descubrirlo en el envío es descubrirlo tarde.
--
-- En una función y no en el CHECK directamente porque Postgres no admite
-- subconsultas en una restricción, y recorrer el array las necesita.
CREATE OR REPLACE FUNCTION public.response_buttons_are_valid(buttons JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT buttons IS NULL
    OR (
      jsonb_typeof(buttons) = 'array'
      AND jsonb_array_length(buttons) BETWEEN 1 AND 3
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(buttons) AS button
        WHERE jsonb_typeof(button) <> 'object'
           OR button->>'label' IS NULL
           OR button->>'intentName' IS NULL
           OR length(trim(button->>'label')) = 0
           OR length(button->>'label') > 20
           OR length(trim(button->>'intentName')) = 0
      )
    );
$$;

ALTER TABLE public.bot_responses
  ADD CONSTRAINT bot_responses_buttons_shape
  CHECK (public.response_buttons_are_valid(buttons));
