-- Garantiza una fila rollup por rama para el progreso migrado que estuviera en
-- un subalcance. El máximo agregado solo debe leer ramas alcanzables, no hojas.

WITH RECURSIVE scope_branches AS (
  SELECT scope.id AS scope_id, scope.id AS branch_id
  FROM public.scopes AS scope
  WHERE scope.parent_id = '00000000-0000-4000-8000-000000000001'::uuid

  UNION ALL

  SELECT child.id AS scope_id, parent.branch_id
  FROM public.scopes AS child
  JOIN scope_branches AS parent ON child.parent_id = parent.scope_id
),
rollups AS (
  SELECT
    progress.user_id,
    branch.branch_id AS scope_id,
    MAX(progress.lead_score) AS lead_score,
    (ARRAY_AGG(
      progress.lead_status
      ORDER BY progress.lead_score DESC, progress.updated_at DESC, progress.id ASC
    ))[1] AS lead_status,
    BOOL_OR(progress.appointment_offered) AS appointment_offered,
    MAX(progress.appointment_offered_at) AS appointment_offered_at,
    MAX(progress.appointment_offer_responded_at) AS appointment_offer_responded_at
  FROM public.user_scope_progress AS progress
  JOIN scope_branches AS branch ON branch.scope_id = progress.scope_id
  GROUP BY progress.user_id, branch.branch_id
)
INSERT INTO public.user_scope_progress (
  user_id,
  scope_id,
  lead_score,
  lead_status,
  appointment_offered,
  appointment_offered_at,
  appointment_offer_responded_at
)
SELECT
  rollups.user_id,
  rollups.scope_id,
  rollups.lead_score,
  rollups.lead_status,
  rollups.appointment_offered,
  rollups.appointment_offered_at,
  rollups.appointment_offer_responded_at
FROM rollups
ON CONFLICT (user_id, scope_id) DO UPDATE SET
  lead_score = GREATEST(public.user_scope_progress.lead_score, EXCLUDED.lead_score),
  lead_status = CASE
    WHEN EXCLUDED.lead_score > public.user_scope_progress.lead_score
      THEN EXCLUDED.lead_status
    ELSE public.user_scope_progress.lead_status
  END,
  appointment_offered = public.user_scope_progress.appointment_offered
    OR EXCLUDED.appointment_offered,
  appointment_offered_at = GREATEST(
    public.user_scope_progress.appointment_offered_at,
    EXCLUDED.appointment_offered_at
  ),
  appointment_offer_responded_at = GREATEST(
    public.user_scope_progress.appointment_offer_responded_at,
    EXCLUDED.appointment_offer_responded_at
  );

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
  has_active_branches BOOLEAN;
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

  SELECT EXISTS (
    SELECT 1
    FROM public.scopes
    WHERE parent_id = '00000000-0000-4000-8000-000000000001'::uuid
      AND is_active = true
  ) INTO has_active_branches;

  SELECT progress.lead_score, progress.lead_status
  INTO aggregate_score, aggregate_status
  FROM public.user_scope_progress AS progress
  JOIN public.scopes AS scope ON scope.id = progress.scope_id
  WHERE progress.user_id = p_user_id
    AND scope.is_active = true
    AND (
      (has_active_branches AND scope.parent_id = '00000000-0000-4000-8000-000000000001'::uuid)
      OR (
        NOT has_active_branches
        AND scope.id = '00000000-0000-4000-8000-000000000001'::uuid
      )
    )
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
