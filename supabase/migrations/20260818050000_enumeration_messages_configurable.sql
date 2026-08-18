-- Los mensajes que introdujo `enumerated-disambiguation` vivian solo como
-- valor por omision en codigo: `resolveConfiguredMessage` los pedia y el log
-- respondia `Config key "unanchored_affirmative_message" not found, using
-- default`. El requisito "Los mensajes de ruteo son configurables" de
-- `scope-routing` ya existia y estos son mensajes de ruteo, asi que se siembran
-- con el mismo texto que usa el codigo. Aditiva: `ON CONFLICT DO NOTHING`
-- respeta cualquier personalizacion que ya hubiera.

INSERT INTO public.bot_config (
  config_key, config_value, config_type, description, category, is_editable
) VALUES
  (
    'scope_next_level_message',
    '{alcance}. ¿Cuál te muestro?',
    'string',
    'Presentación de un alcance mencionado a secas que sí tiene nivel siguiente que ofrecer.',
    'system_messages',
    true
  ),
  (
    'scope_only_presentation_message',
    '{alcance}. ¿En qué más puedo ayudarte?',
    'string',
    'Presentación de un alcance mencionado a secas que no tiene nivel siguiente.',
    'system_messages',
    true
  ),
  (
    'sibling_message',
    '¿Cuál de estas te interesa?',
    'string',
    'Respuesta a pedir otra opción: se enumeran los hermanos del alcance en foco.',
    'system_messages',
    true
  ),
  (
    'sibling_up_message',
    'No tengo más para ese; esto es lo que sí tengo:',
    'string',
    'Respuesta a pedir otra opción cuando el alcance en foco no tiene hermanos.',
    'system_messages',
    true
  ),
  (
    'sibling_none_message',
    'No tengo más opciones que mostrarte por ahora. ¿En qué más puedo ayudarte?',
    'string',
    'Respuesta a pedir otra opción cuando no hay ninguna más que ofrecer.',
    'system_messages',
    true
  ),
  (
    'pending_offer_repeat_message',
    'No elige por sí sola: ¿cuál de estas te muestro?',
    'string',
    'Un afirmativo contra una oferta de varias opciones no elige: se repiten.',
    'system_messages',
    true
  ),
  (
    'unanchored_affirmative_message',
    '¿Sí a qué? Esto es lo que tengo disponible:',
    'string',
    'Un afirmativo sin oferta viva: se pregunta a qué se refiere y se ofrecen las opciones.',
    'system_messages',
    true
  )
ON CONFLICT (config_key) DO NOTHING;
