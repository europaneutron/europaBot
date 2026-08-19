-- El rotulo del boton que ofrece agendar, editable como el resto de los
-- mensajes de ruteo. Vivia solo como valor por omision en codigo.
INSERT INTO public.bot_config (
  config_key, config_value, config_type, description, category, is_editable
) VALUES (
  'offer_appointment_label',
  'Agendar visita',
  'string',
  'Texto del botón con el que se ofrece agendar una visita al final de una respuesta.',
  'system_messages',
  true
)
ON CONFLICT (config_key) DO NOTHING;
