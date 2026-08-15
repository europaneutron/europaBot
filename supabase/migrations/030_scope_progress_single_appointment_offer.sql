-- Retira invitaciones a agendar de las respuestas de contenido sembradas.
-- La condición incluye el texto original para no sobrescribir ediciones hechas
-- por un administrador desde el dashboard.

UPDATE public.bot_responses
SET message_text = to_jsonb(
  'Te comparto el link directo: [URL DE GOOGLE MAPS]'::text
)
WHERE intent_name = 'ubicacion'
  AND response_key = 'maps'
  AND message_text = to_jsonb(
    E'Te comparto el link directo: [URL DE GOOGLE MAPS]\n\nTambién puedo programar una visita para que conozcas personalmente el desarrollo. ¿Te interesa?'::text
  );

UPDATE public.bot_responses
SET message_text = to_jsonb(
  'Puedo conectarte con un asesor hipotecario para hacer una simulación personalizada.'::text
)
WHERE intent_name = 'creditos'
  AND response_key = 'simulator'
  AND message_text = to_jsonb(
    'Puedo conectarte con un asesor hipotecario para hacer una simulación personalizada. ¿Te gustaría agendar una llamada?'::text
  );

UPDATE public.bot_responses
SET message_text = to_jsonb(
  'El material incluye las unidades disponibles y sus características.'::text
)
WHERE intent_name = 'brochure'
  AND response_key = 'followup'
  AND message_text #>> '{}' LIKE
    '¿Te gustaría agendar una visita al desarrollo para conocerlo personalmente? Puedo mostrarte las unidades disponibles.%';
