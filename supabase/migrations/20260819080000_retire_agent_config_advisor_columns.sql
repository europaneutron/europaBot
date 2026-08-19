-- ============================================
-- MIGRACIÓN: retirar la duplicación de agent_config
-- Fecha: 2026-08-19
-- Objetivo: segundo y último paso de la unificación descrita en AGENTS.md
-- sección 6. `bot_config.scope_id` (migración 20260819050000) ya es la única
-- fuente que el código lee para advisor_phone, business_hours y
-- advisor_email -- ver `configRepository.getManyByScope` y
-- `appointmentRepository.getDefaultAgent`. Ninguna ruta lee ya estas tres
-- columnas de agent_config, así que se retiran.
--
-- Antes de retirarlas se arrastra lo que todavía viva ahí. La migración 027
-- vació la fila raíz pero dejó dicho que "los alcances no raíz conservan sus
-- valores propios": un desarrollo con asesor propio tiene su teléfono en esta
-- tabla y en ninguna otra. Soltar la columna sin copiarlo lo dejaría heredando
-- el del negocio en silencio, que es exactamente la falla que esta unificación
-- existe para evitar.
-- ============================================

INSERT INTO public.bot_config (
  config_key, config_value, config_type, description, category, is_editable, scope_id
)
SELECT
  source.config_key,
  source.config_value,
  'string',
  source.description,
  'contact',
  true,
  source.scope_id
FROM (
  -- Una sola fila por alcance: un alcance puede tener varias en agent_config
  -- y el upsert no puede tocar dos veces la misma clave. Gana la activa, y
  -- entre activas la mas reciente.
  WITH one_per_scope AS (
    SELECT DISTINCT ON (scope_id) scope_id, advisor_phone, business_hours, advisor_email
    FROM public.agent_config
    WHERE scope_id IS NOT NULL
    ORDER BY scope_id, is_active DESC, updated_at DESC
  )
  SELECT scope_id, 'advisor_phone' AS config_key, NULLIF(TRIM(advisor_phone), '') AS config_value,
         'Telefono del asesor de este alcance' AS description
  FROM one_per_scope
  UNION ALL
  SELECT scope_id, 'business_hours', NULLIF(TRIM(business_hours), ''),
         'Horario de atencion de este alcance'
  FROM one_per_scope
  UNION ALL
  SELECT scope_id, 'advisor_email', NULLIF(TRIM(advisor_email), ''),
         'Email del asesor de este alcance'
  FROM one_per_scope
) AS source
WHERE source.config_value IS NOT NULL
ON CONFLICT (config_key, scope_id) DO UPDATE
  SET config_value = EXCLUDED.config_value
  -- Si el alcance ya tiene fila propia en bot_config, esa es la que el
  -- administrador editó despues: solo se rellena si está vacía.
  WHERE COALESCE(NULLIF(TRIM(public.bot_config.config_value), ''), '') = '';

ALTER TABLE public.agent_config
  DROP COLUMN business_hours,
  DROP COLUMN advisor_phone,
  DROP COLUMN advisor_email;
