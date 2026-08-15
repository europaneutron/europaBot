-- Lleva checkpoints, calificación y ofrecimientos de cita por alcance sin
-- cambiar el contrato agregado que consumen las vistas existentes.

ALTER TABLE public.intent_configurations
  ADD COLUMN is_strong_signal BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.intent_configurations.is_strong_signal IS
  'Una coincidencia activa el ofrecimiento de cita sin esperar al umbral de checkpoints.';

ALTER TABLE public.user_checkpoints
  ADD COLUMN scope_id UUID REFERENCES public.scopes(id) ON DELETE RESTRICT;

-- El mensaje entrante más cercano es la evidencia más precisa del foco que
-- originó un checkpoint. Los registros anteriores al ruteo pertenecen a la
-- única rama disponible entonces; si no existe una rama se conservan en raíz.
UPDATE public.user_checkpoints AS checkpoint
SET scope_id = COALESCE(
  (
    SELECT conversation.scope_id
    FROM public.conversations AS conversation
    WHERE conversation.user_id = checkpoint.user_id
      AND conversation.direction = 'inbound'
      AND conversation.scope_id IS NOT NULL
      AND conversation.created_at <= checkpoint.completed_at
    ORDER BY conversation.created_at DESC, conversation.id DESC
    LIMIT 1
  ),
  (
    SELECT CASE
      WHEN COUNT(*) = 1 THEN MIN(scope.id::text)::uuid
      ELSE '00000000-0000-4000-8000-000000000001'::uuid
    END
    FROM public.scopes AS scope
    WHERE scope.parent_id = '00000000-0000-4000-8000-000000000001'::uuid
      AND scope.is_active = true
  ),
  '00000000-0000-4000-8000-000000000001'::uuid
);

-- Se deduplica antes de imponer la clave nueva. Una base inconsistente no debe
-- abortar la migración a medias ni convertir una repetición en progreso extra.
DELETE FROM public.user_checkpoints AS checkpoint
USING (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, scope_id, intent_name
      ORDER BY completed_at ASC, id ASC
    ) AS duplicate_position
  FROM public.user_checkpoints
) AS ranked
WHERE checkpoint.id = ranked.id
  AND ranked.duplicate_position > 1;

ALTER TABLE public.user_checkpoints
  ALTER COLUMN scope_id SET NOT NULL,
  DROP CONSTRAINT user_checkpoints_user_id_intent_name_key,
  ADD CONSTRAINT user_checkpoints_user_scope_intent_key
    UNIQUE (user_id, scope_id, intent_name);

CREATE INDEX idx_user_checkpoints_scope_user
  ON public.user_checkpoints(scope_id, user_id);

CREATE TABLE public.user_scope_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  scope_id UUID NOT NULL REFERENCES public.scopes(id) ON DELETE CASCADE,
  lead_score INTEGER NOT NULL DEFAULT 0 CHECK (lead_score >= 0),
  lead_status VARCHAR(20) NOT NULL DEFAULT 'cold'
    CHECK (lead_status IN ('cold', 'warm', 'hot')),
  appointment_offered BOOLEAN NOT NULL DEFAULT false,
  appointment_offered_at TIMESTAMPTZ,
  appointment_offer_responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_scope_progress_user_scope_key UNIQUE (user_id, scope_id)
);

COMMENT ON TABLE public.user_scope_progress IS
  'Detalle de interés y ofrecimiento de cita de una persona en cada alcance.';

CREATE INDEX idx_user_scope_progress_scope_score
  ON public.user_scope_progress(scope_id, lead_score DESC);

CREATE TRIGGER update_user_scope_progress_updated_at
BEFORE UPDATE ON public.user_scope_progress
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.user_scope_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_user_scope_progress"
  ON public.user_scope_progress FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "admin_read_user_scope_progress"
  ON public.user_scope_progress FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE admin_users.id = (SELECT auth.uid())
        AND admin_users.is_active = true
    )
  );

GRANT SELECT ON TABLE public.user_scope_progress TO authenticated;
GRANT ALL ON TABLE public.user_scope_progress TO service_role;

ALTER TABLE public.user_progress
  ADD COLUMN appointment_offer_count INTEGER NOT NULL DEFAULT 0
    CHECK (appointment_offer_count >= 0),
  ADD COLUMN last_appointment_offer_at TIMESTAMPTZ,
  ADD COLUMN last_appointment_offer_rejected_at TIMESTAMPTZ;

-- Se crea primero una fila por alcance observado. Después una sola fila por
-- persona recibe la cifra anterior exacta, preservando el contrato agregado.
INSERT INTO public.user_scope_progress (user_id, scope_id)
SELECT DISTINCT checkpoint.user_id, checkpoint.scope_id
FROM public.user_checkpoints AS checkpoint
ON CONFLICT (user_id, scope_id) DO NOTHING;

INSERT INTO public.user_scope_progress (
  user_id,
  scope_id,
  lead_score,
  lead_status,
  appointment_offered,
  appointment_offered_at
)
SELECT
  users.id,
  COALESCE(
    (
      SELECT checkpoint.scope_id
      FROM public.user_checkpoints AS checkpoint
      WHERE checkpoint.user_id = users.id
      ORDER BY checkpoint.completed_at DESC, checkpoint.id DESC
      LIMIT 1
    ),
    session.current_scope_id,
    '00000000-0000-4000-8000-000000000001'::uuid
  ),
  users.lead_score,
  users.lead_status,
  COALESCE(progress.appointment_offered, false),
  progress.appointment_offered_at
FROM public.users AS users
LEFT JOIN public.user_sessions AS session ON session.user_id = users.id
LEFT JOIN public.user_progress AS progress ON progress.user_id = users.id
ON CONFLICT (user_id, scope_id) DO UPDATE SET
  lead_score = EXCLUDED.lead_score,
  lead_status = EXCLUDED.lead_status,
  appointment_offered = EXCLUDED.appointment_offered,
  appointment_offered_at = EXCLUDED.appointment_offered_at;

UPDATE public.user_progress
SET appointment_offer_count = CASE WHEN appointment_offered THEN 1 ELSE 0 END,
    last_appointment_offer_at = appointment_offered_at;

ALTER TABLE public.appointments
  ADD COLUMN scope_id UUID DEFAULT '00000000-0000-4000-8000-000000000001'
    REFERENCES public.scopes(id) ON DELETE RESTRICT;

UPDATE public.appointments AS appointment
SET scope_id = COALESCE(
  (
    SELECT conversation.scope_id
    FROM public.conversations AS conversation
    WHERE conversation.user_id = appointment.user_id
      AND conversation.direction = 'inbound'
      AND conversation.scope_id IS NOT NULL
      AND conversation.created_at <= appointment.created_at
    ORDER BY conversation.created_at DESC, conversation.id DESC
    LIMIT 1
  ),
  (
    SELECT session.current_scope_id
    FROM public.user_sessions AS session
    WHERE session.user_id = appointment.user_id
  ),
  '00000000-0000-4000-8000-000000000001'::uuid
)
WHERE appointment.scope_id IS NULL
   OR appointment.scope_id = '00000000-0000-4000-8000-000000000001'::uuid;

ALTER TABLE public.appointments
  ALTER COLUMN scope_id SET NOT NULL;

CREATE INDEX idx_appointments_scope_created
  ON public.appointments(scope_id, created_at DESC);

-- Esta función es el único punto que escribe el detalle y su agregado. Hacerlo
-- en dos consultas permitiría que el dashboard mostrara una cifra obsoleta si
-- el proceso se interrumpe entre ambas.
CREATE OR REPLACE FUNCTION public.save_scope_lead_score(
  p_user_id UUID,
  p_scope_id UUID,
  p_lead_score INTEGER,
  p_lead_status VARCHAR
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  aggregate_score INTEGER;
  aggregate_status VARCHAR(20);
BEGIN
  INSERT INTO public.user_scope_progress (
    user_id,
    scope_id,
    lead_score,
    lead_status
  ) VALUES (
    p_user_id,
    p_scope_id,
    p_lead_score,
    p_lead_status
  )
  ON CONFLICT (user_id, scope_id) DO UPDATE SET
    lead_score = EXCLUDED.lead_score,
    lead_status = EXCLUDED.lead_status,
    updated_at = NOW();

  SELECT progress.lead_score, progress.lead_status
  INTO aggregate_score, aggregate_status
  FROM public.user_scope_progress AS progress
  JOIN public.scopes AS scope ON scope.id = progress.scope_id
  WHERE progress.user_id = p_user_id
    AND scope.is_active = true
  ORDER BY progress.lead_score DESC, progress.updated_at DESC, progress.id ASC
  LIMIT 1;

  UPDATE public.users
  SET lead_score = COALESCE(aggregate_score, 0),
      lead_status = COALESCE(aggregate_status, 'cold'),
      updated_at = NOW()
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_scope_lead_score(UUID, UUID, INTEGER, VARCHAR)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_scope_lead_score(UUID, UUID, INTEGER, VARCHAR)
  TO service_role;

INSERT INTO public.bot_config (
  config_key,
  config_value,
  config_type,
  description,
  category,
  is_editable
) VALUES (
  'appointment_offer_cooldown_hours',
  '168',
  'integer',
  'Horas de enfriamiento por persona después de rechazar una oferta de cita',
  'appointments',
  true
)
ON CONFLICT (config_key) DO NOTHING;
