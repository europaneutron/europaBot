-- La respuesta general de precio se compone con las opciones y sus valores
-- vigentes. El texto conector sigue siendo editable como los demás mensajes
-- de ruteo; {opciones} se resuelve en tiempo de conversación sin usar un LLM.

INSERT INTO public.bot_config (
  config_key, config_value, config_type, description, category, is_editable
) VALUES (
  'scope_catalog_summary_message',
  'Precios disponibles: {opciones}.',
  'string',
  'Resumen compuesto con los alcances y precios vigentes antes de pedir una elección.',
  'system_messages',
  true
)
ON CONFLICT (config_key) DO NOTHING;
