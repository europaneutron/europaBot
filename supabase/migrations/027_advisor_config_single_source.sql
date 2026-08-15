-- ============================================
-- MIGRACION 027: Fuente unica para la configuracion del asesor
-- ============================================
-- Objetivo: que bot_config sea la fuente de verdad de advisor_phone,
-- business_hours y advisor_email, y que agent_config solo los lleve cuando un
-- alcance define explicitamente su propio valor.
--
-- Contexto: la migracion 009 introdujo el sistema de configuracion por clave y
-- valor y redeclaro tres valores que la 007 ya tenia como columnas en
-- agent_config, sin retirar los anteriores. La fila raiz de agent_config quedo
-- sembrada con un numero de prueba, y como la resolucion recorre agent_config
-- antes que bot_config, ese numero opacaba permanentemente al que el
-- administrador configura desde el dashboard. El sintoma es silencioso: nada
-- falla, las notificaciones simplemente salen al numero equivocado.
--
-- Esta migracion vacia esas tres columnas unicamente en la fila del alcance
-- raiz. Los alcances no raiz conservan sus valores, que son sobrescrituras
-- legitimas por desarrollo.
--
-- Antes de vaciar, se preserva cualquier valor que un administrador haya puesto
-- a mano en agent_config: si bot_config esta vacio y agent_config tiene un valor
-- que no es el sembrado por la 007, se copia a bot_config. El valor de prueba
-- no se copia: es preferible que el sistema falle con un error claro a que
-- notifique en silencio a un numero que nadie revisa.

DO $$
DECLARE
  root_scope CONSTANT UUID := '00000000-0000-4000-8000-000000000001';
  seeded_phone CONSTANT TEXT := '+529933906926';
  agent_phone TEXT;
  agent_hours TEXT;
  agent_email TEXT;
BEGIN
  SELECT
    NULLIF(TRIM(advisor_phone), ''),
    NULLIF(TRIM(business_hours), ''),
    NULLIF(TRIM(advisor_email), '')
  INTO agent_phone, agent_hours, agent_email
  FROM public.agent_config
  WHERE scope_id = root_scope AND is_active = true
  LIMIT 1;

  -- Preservar valores puestos a mano, sin arrastrar el numero de prueba.
  -- Se usa INSERT ... ON CONFLICT y no UPDATE: si la clave no existiera en
  -- bot_config, un UPDATE no afectaria ninguna fila y el valor se perderia de
  -- las dos tablas al vaciar agent_config mas abajo.
  IF agent_phone IS NOT NULL AND agent_phone <> seeded_phone THEN
    INSERT INTO public.bot_config (config_key, config_value, config_type, description, category, is_editable)
    VALUES ('advisor_phone', agent_phone, 'string', 'Telefono del asesor para notificaciones', 'contact', true)
    ON CONFLICT (config_key) DO UPDATE
      SET config_value = EXCLUDED.config_value
      WHERE COALESCE(NULLIF(TRIM(public.bot_config.config_value), ''), '') = '';
  END IF;

  IF agent_hours IS NOT NULL THEN
    INSERT INTO public.bot_config (config_key, config_value, config_type, description, category, is_editable)
    VALUES ('business_hours', agent_hours, 'string', 'Horario de atencion para mostrar a usuarios', 'contact', true)
    ON CONFLICT (config_key) DO UPDATE
      SET config_value = EXCLUDED.config_value
      WHERE COALESCE(NULLIF(TRIM(public.bot_config.config_value), ''), '') = '';
  END IF;

  IF agent_email IS NOT NULL THEN
    INSERT INTO public.bot_config (config_key, config_value, config_type, description, category, is_editable)
    VALUES ('advisor_email', agent_email, 'string', 'Email del asesor para notificaciones', 'contact', true)
    ON CONFLICT (config_key) DO UPDATE
      SET config_value = EXCLUDED.config_value
      WHERE COALESCE(NULLIF(TRIM(public.bot_config.config_value), ''), '') = '';
  END IF;
END $$;

-- La fila raiz deja de opacar a bot_config. Los alcances no raiz conservan
-- sus valores propios.
UPDATE public.agent_config
SET
  advisor_phone = NULL,
  business_hours = NULL,
  advisor_email = NULL
WHERE scope_id = '00000000-0000-4000-8000-000000000001';

COMMENT ON COLUMN public.agent_config.advisor_phone IS
  'Sobrescritura por alcance. La fuente de verdad global es bot_config.advisor_phone, editable desde el dashboard. Nulo en el alcance raiz.';
COMMENT ON COLUMN public.agent_config.business_hours IS
  'Sobrescritura por alcance. La fuente de verdad global es bot_config.business_hours, editable desde el dashboard. Nulo en el alcance raiz.';
COMMENT ON COLUMN public.agent_config.advisor_email IS
  'Sobrescritura por alcance. La fuente de verdad global es bot_config.advisor_email, editable desde el dashboard. Nulo en el alcance raiz.';
