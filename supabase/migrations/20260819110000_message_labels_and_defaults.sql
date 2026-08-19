-- ============================================
-- MIGRACIÓN: los mensajes del sistema, en cristiano
-- Fecha: 2026-08-19
-- Objetivo: dos cosas sobre los mismos mensajes.
--
-- 1. La etiqueta. La pantalla usa `description` como título del campo, así que
--    quien edita leía "Presentación de un alcance mencionado a secas que no
--    tiene nivel siguiente". Ahora dice cuándo lo va a leer un cliente.
--
-- 2. El texto. Los sembrados eran de laboratorio --"Esto es lo que hay",
--    "No elige por sí sola"-- y suenan a máquina. Se cambian por prosa de
--    asesor.
--
-- El texto solo se cambia donde sigue siendo el de fábrica: si alguien ya lo
-- escribió a su manera, se respeta. Por eso cada UPDATE compara contra el
-- valor sembrado antes de tocarlo.
-- ============================================

-- 1. Etiquetas
UPDATE public.bot_config SET description = 'Cuando pregunta de qué proyecto le hablan'
  WHERE config_key = 'scope_disambiguation_message';

UPDATE public.bot_config SET description = 'Cuando ya le adelantó los proyectos y le pregunta cuál'
  WHERE config_key = 'scope_disambiguation_followup_message';

UPDATE public.bot_config SET description = 'El adelanto con los proyectos y sus precios'
  WHERE config_key = 'scope_catalog_summary_message';

UPDATE public.bot_config SET description = 'Cuando el cliente nombra un proyecto que tiene opciones dentro'
  WHERE config_key = 'scope_next_level_message';

UPDATE public.bot_config SET description = 'Cuando el cliente nombra un proyecto y no hay más que elegir'
  WHERE config_key = 'scope_only_presentation_message';

UPDATE public.bot_config SET description = 'Cuando el cliente pide ver otra opción'
  WHERE config_key = 'sibling_message';

UPDATE public.bot_config SET description = 'Cuando pide otra y en ese proyecto no hay más'
  WHERE config_key = 'sibling_up_message';

UPDATE public.bot_config SET description = 'Cuando pide otra y ya no queda ninguna'
  WHERE config_key = 'sibling_none_message';

UPDATE public.bot_config SET description = 'Cuando dice que sí y el bot no había ofrecido nada'
  WHERE config_key = 'unanchored_affirmative_message';

UPDATE public.bot_config SET description = 'Cuando dice que sí y había varias opciones sobre la mesa'
  WHERE config_key = 'pending_offer_repeat_message';

UPDATE public.bot_config SET description = 'Texto del botón para agendar una visita (máximo 20 caracteres)'
  WHERE config_key = 'offer_appointment_label';

UPDATE public.bot_config SET description = 'Saludo: la lista de proyectos (solo si apagas el saludo automático)'
  WHERE config_key = 'scope_presentation_message';

-- 2. Textos, solo donde nadie los ha tocado
UPDATE public.bot_config
SET config_value = '¡Con gusto te ayudo! 😊 Manejamos {alcances}. ¿Sobre cuál te platico?'
WHERE config_key = 'scope_disambiguation_message'
  AND config_value = '¿De cuál {project_singular} te gustaría recibir información?';

UPDATE public.bot_config
SET config_value = '¿De cuál te platico más?'
WHERE config_key = 'scope_disambiguation_followup_message'
  AND config_value = '¿Cuál te muestro?';

UPDATE public.bot_config
SET config_value = E'Te comparto lo que tenemos disponible 🏡\n\n{opciones}'
WHERE config_key = 'scope_catalog_summary_message'
  AND config_value = 'Esto es lo que hay: {opciones}.';

UPDATE public.bot_config
SET config_value = '{alcance} 🏡 Dentro hay varias opciones, ¿cuál te muestro?'
WHERE config_key = 'scope_next_level_message'
  AND config_value = '{alcance}. ¿Cuál te muestro?';

UPDATE public.bot_config
SET config_value = '¡Claro! Te platico de {alcance} 🏡 ¿Qué te gustaría saber?'
WHERE config_key = 'scope_only_presentation_message'
  AND config_value = '{alcance}. ¿En qué más puedo ayudarte?';

UPDATE public.bot_config
SET config_value = 'Claro, ¿cuál de estas te interesa?'
WHERE config_key = 'sibling_message'
  AND config_value = '¿Cuál de estas te interesa?';

UPDATE public.bot_config
SET config_value = 'De ese no tengo más, pero esto sí lo manejo:'
WHERE config_key = 'sibling_up_message'
  AND config_value = 'No tengo más para ese; esto es lo que sí tengo:';

UPDATE public.bot_config
SET config_value = 'Por ahora no tengo más que mostrarte. ¿Te ayudo con algo más? 😊'
WHERE config_key = 'sibling_none_message'
  AND config_value = 'No tengo más opciones que mostrarte por ahora. ¿En qué más puedo ayudarte?';

UPDATE public.bot_config
SET config_value = '¡Claro! ¿A cuál te refieres? 😊'
WHERE config_key = 'unanchored_affirmative_message'
  AND config_value = '¿Sí a qué? Esto es lo que tengo disponible:';

UPDATE public.bot_config
SET config_value = '¿Cuál de estas te muestro?'
WHERE config_key = 'pending_offer_repeat_message'
  AND config_value = 'No elige por sí sola: ¿cuál de estas te muestro?';
