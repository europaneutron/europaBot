-- La oferta pendiente vive junto a la pregunta retenida: mismo sitio, mismo
-- ciclo de vida. Es aditivo: las sesiones existentes arrancan sin oferta.
--
-- Una oferta se modela siempre como una lista de opciones. Una oferta de
-- si/no ("¿te muestro los modelos?") es una oferta de una sola opcion: el
-- afirmativo la ejecuta directo. Una enumeracion ("¿cual desarrollo?") es una
-- oferta de varias; un afirmativo ahi no elige, repite las opciones.

ALTER TABLE public.user_sessions
  ADD COLUMN pending_offer_intent_name VARCHAR(50),
  ADD COLUMN pending_offer_level UUID REFERENCES public.scopes(id) ON DELETE SET NULL,
  ADD COLUMN pending_offer_options JSONB,
  ADD COLUMN pending_offer_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.user_sessions.pending_offer_options IS
  'Arreglo de opciones ofrecidas: [{"id", "scopeId", "label"}]. Una sola opcion es una oferta de si/no; dos o mas, una enumeracion.';

COMMENT ON COLUMN public.user_sessions.pending_offer_updated_at IS
  'La oferta caduca con la misma ventana que el foco: un "si" de dias despues no puede resolverse contra una oferta que el lead ya olvido.';

-- Una respuesta que termina en pregunta de si/no declara que intencion ofrece,
-- para que el afirmativo del lead tenga contra que resolverse. El compilador
-- bloquea publicar una respuesta de si/no que no la declare.
ALTER TABLE public.bot_responses
  ADD COLUMN offers_intent_name VARCHAR(50);

COMMENT ON COLUMN public.bot_responses.offers_intent_name IS
  'Cuando el texto de la respuesta termina en pregunta de si/no, la intencion que un afirmativo del lead debe disparar.';
