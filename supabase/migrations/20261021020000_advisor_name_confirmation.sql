-- Captura del nombre para el asesor con confirmación.
--
-- Hasta hoy, lo que el lead escribía tras "¿podrías compartirme tu nombre?" se
-- registraba como su nombre sin más: "no bro, no necesito mas ayuda" quedó como
-- nombre del visitante. Ahora el texto queda como candidato y solo se registra
-- cuando el lead lo confirma; esta columna guarda ese candidato entre mensajes.
--
-- Impacto: aditivo. NULL (el valor de toda sesión existente) significa que no
-- hay candidato pendiente y el comportamiento previo a la confirmación no aplica
-- porque la confirmación la pide el código. user_sessions ya tiene RLS y sus
-- políticas para service_role y authenticated; una columna nueva las hereda.
ALTER TABLE public.user_sessions
  ADD COLUMN pending_advisor_name TEXT;

COMMENT ON COLUMN public.user_sessions.pending_advisor_name IS
  'Nombre que el lead escribió para el asesor y espera su confirmación. NULL si no hay candidato.';

-- Textos nuevos, editables en Ajustes junto con el resto de la derivación.
INSERT INTO public.bot_config
  (config_key, config_value, config_type, description, category, is_editable, scope_id)
VALUES
  ('derivation_confirm_name', '¿Te registro como "{nombre}"? Responde sí, o escribe tu nombre.', 'string',
   'Confirmación del nombre antes de registrarlo (variable: {nombre})', 'derivation_messages', true, NULL),
  ('derivation_cancelled', 'Va, no hay problema. Si después quieres hablar con un asesor, solo dímelo.', 'string',
   'Respuesta cuando el lead cancela la derivación al asesor', 'derivation_messages', true, NULL),
  ('ai_derivation_intro', 'Con gusto te paso con un asesor.', 'string',
   'Introducción de la derivación cuando la inicia la conversación con IA', 'derivation_messages', true, NULL)
ON CONFLICT (config_key) WHERE scope_id IS NULL DO NOTHING;
