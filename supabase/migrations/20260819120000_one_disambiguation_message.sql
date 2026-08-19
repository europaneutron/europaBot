-- ============================================
-- MIGRACIÓN: un solo mensaje de desambiguación
-- Fecha: 2026-08-19
-- Objetivo: retirar los mensajes del sistema que dejaron de tener consumidor.
--
-- El bot preguntaba "¿de cuál te platico?" aunque el nivel de la conversación
-- ya tuviera respuesta escrita, y ese mismo momento salía con tres textos
-- distintos --un adelanto compuesto, la coletilla de después, y la pregunta a
-- secas-- según por dónde hubiera entrado. Ahora es uno solo:
-- `scope_disambiguation_message`.
--
-- Lo mismo con "pedir otra": con dos desarrollos, pedir el otro dejaba
-- exactamente una opción, así que enseñaba un botón con la única respuesta
-- posible. Ahora cambia el foco directo, y con tres o más es la misma
-- desambiguación de arriba.
--
-- El resto pasa a texto fijo en el código: son momentos de una línea que
-- repiten lo que ya está en los botones.
--
-- Prod: borra filas de configuración cuyo valor ya no lee nadie. Si alguien
-- había escrito ahí, ese texto se pierde a propósito: el momento en que salía
-- ya no existe, y dejar el campo en la pantalla sería peor.
-- ============================================

DELETE FROM public.bot_config
WHERE config_key IN (
  'scope_catalog_summary_message',
  'scope_disambiguation_followup_message',
  'scope_next_level_message',
  'scope_only_presentation_message',
  'scope_presentation_message',
  'sibling_message',
  'sibling_up_message',
  'sibling_none_message',
  'unanchored_affirmative_message',
  'pending_offer_repeat_message'
);

-- Ahora cubre también "¿y el otro?", así que la etiqueta lo dice.
UPDATE public.bot_config
SET description = 'Cuando pregunta de qué proyecto le hablan'
WHERE config_key = 'scope_disambiguation_message';
