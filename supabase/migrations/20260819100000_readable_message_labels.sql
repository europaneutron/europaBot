-- ============================================
-- MIGRACIÓN: los mensajes del sistema se llaman como lo que son
-- Fecha: 2026-08-19
-- Objetivo: la pantalla de Ajustes usa `description` como etiqueta del campo,
-- así que quien edita lee "Presentación de un alcance mencionado a secas que
-- no tiene nivel siguiente" y no sabe cuál está tocando. Se reescriben como
-- lo que el lead ve, no como lo que el código hace.
--
-- Solo cambian las descripciones: ningún valor se toca.
-- ============================================

UPDATE public.bot_config SET description = 'Saludo: lista de fraccionamientos (solo si apagas el saludo compuesto)'
  WHERE config_key = 'scope_presentation_message';

UPDATE public.bot_config SET description = 'Antes de preguntar cuál: adelanto con nombres y precios'
  WHERE config_key = 'scope_catalog_summary_message';

UPDATE public.bot_config SET description = 'Preguntar de qué fraccionamiento habla, sin haber adelantado nada'
  WHERE config_key = 'scope_disambiguation_message';

UPDATE public.bot_config SET description = 'Preguntar cuál, justo después del adelanto'
  WHERE config_key = 'scope_disambiguation_followup_message';

UPDATE public.bot_config SET description = 'Nombró un fraccionamiento y dentro hay opciones que ofrecerle'
  WHERE config_key = 'scope_next_level_message';

UPDATE public.bot_config SET description = 'Nombró un fraccionamiento y no hay nada más dentro'
  WHERE config_key = 'scope_only_presentation_message';

UPDATE public.bot_config SET description = 'Pidió ver otra opción: se le ofrecen las demás'
  WHERE config_key = 'sibling_message';

UPDATE public.bot_config SET description = 'Pidió otra opción y en esa rama no hay: se le ofrece lo demás'
  WHERE config_key = 'sibling_up_message';

UPDATE public.bot_config SET description = 'Pidió otra opción y ya no queda ninguna'
  WHERE config_key = 'sibling_none_message';

UPDATE public.bot_config SET description = 'Dijo que sí sin que hubiera nada ofrecido'
  WHERE config_key = 'unanchored_affirmative_message';

UPDATE public.bot_config SET description = 'Dijo que sí y había varias opciones: hay que repetirlas'
  WHERE config_key = 'pending_offer_repeat_message';

UPDATE public.bot_config SET description = 'Texto del botón para agendar una visita (máximo 20 caracteres)'
  WHERE config_key = 'offer_appointment_label';
