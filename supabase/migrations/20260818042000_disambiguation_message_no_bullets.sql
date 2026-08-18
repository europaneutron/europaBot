-- La desambiguación deja de mandar la lista como texto con guiones: las
-- opciones ahora salen como botones o lista interactiva (spec
-- `enumerated-disambiguation`), y el procesador ya no llena la variable
-- {alcances}. Un valor existente que la referencie —sembrado o personalizado
-- por el asistente de onboarding— se queda con un hueco vacío colgando; se
-- quita el token y los saltos de línea que lo precedían, conservando el
-- resto de la personalización.
UPDATE public.bot_config
SET config_value = regexp_replace(config_value, '\n*\{alcances\}', '', 'g')
WHERE config_key = 'scope_disambiguation_message'
  AND config_value LIKE '%{alcances}%';

INSERT INTO public.bot_config (
  config_key, config_value, config_type, description, category, is_editable
) VALUES (
  'scope_disambiguation_followup_message',
  '¿Cuál te muestro?',
  'string',
  'Pregunta de desambiguación cuando ya se afirmó algo cierto antes de enumerar.',
  'system_messages',
  true
)
ON CONFLICT (config_key) DO NOTHING;
