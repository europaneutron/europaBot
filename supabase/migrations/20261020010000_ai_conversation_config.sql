-- Prepara la conversación con IA sin activarla ni cambiar la fuente del score.
-- Las filas globales admiten sobrescritura por alcance; description es la etiqueta en Ajustes.
INSERT INTO public.bot_config
  (config_key, config_value, config_type, description, category, is_editable, scope_id)
VALUES
  ('ai_enabled', 'false', 'boolean', 'Activar conversación con IA', 'ai_conversation', true, NULL),
  ('ai_allowed_phones', '[]', 'json', 'Teléfonos permitidos para probar la conversación con IA', 'ai_conversation', true, NULL),
  ('ai_responder_model', 'claude-haiku-5-5', 'string', 'Modelo del contestador', 'ai_conversation', true, NULL),
  ('ai_responder_effort', 'low', 'string', 'Esfuerzo del contestador', 'ai_conversation', true, NULL),
  ('ai_classifier_model', 'claude-haiku-5-5', 'string', 'Modelo del clasificador de temas', 'ai_conversation', true, NULL),
  ('ai_classifier_effort', 'low', 'string', 'Esfuerzo del clasificador de temas', 'ai_conversation', true, NULL),
  ('ai_responder_timeout_ms', '8000', 'integer', 'Tiempo límite del contestador (milisegundos)', 'ai_conversation', true, NULL),
  ('ai_classifier_timeout_ms', '4000', 'integer', 'Tiempo límite del clasificador (milisegundos)', 'ai_conversation', true, NULL),
  ('ai_score_source', 'matcher', 'string', 'Fuente del score: matcher o classifier', 'ai_conversation', true, NULL),
  ('ai_messages_per_phone_per_hour', '30', 'integer', 'Máximo de mensajes con IA por teléfono por hora', 'ai_conversation', true, NULL),
  ('ai_persona_name', '', 'string', 'Nombre del asistente', 'ai_conversation', true, NULL),
  ('ai_persona_register', 'tu', 'string', 'Tratamiento: tu o usted', 'ai_conversation', true, NULL),
  ('ai_persona_emojis', 'pocos', 'string', 'Uso de emojis: si, pocos o no', 'ai_conversation', true, NULL),
  ('ai_persona_length', 'corta', 'string', 'Largo de respuesta: corta o media', 'ai_conversation', true, NULL),
  ('ai_persona_notes', '', 'string', 'Notas de personalidad del asistente', 'ai_conversation', true, NULL)
ON CONFLICT (config_key) WHERE scope_id IS NULL DO NOTHING;
