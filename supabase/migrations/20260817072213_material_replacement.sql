-- Publica una corrida completa como una sola transaccion. Sustituir es el
-- comportamiento normal; anadir conserva las ramas que ya estaban activas.

ALTER TABLE public.compiler_runs
  ADD COLUMN replacement_mode TEXT NOT NULL DEFAULT 'replace'
  CONSTRAINT compiler_runs_replacement_mode_check
  CHECK (replacement_mode IN ('replace', 'add'));

ALTER TABLE public.bot_responses
  ADD CONSTRAINT bot_responses_inactive_reason_check
  CHECK (
    inactive_reason IS NULL
    OR inactive_reason IN (
      'compiler_replacement',
      'collision_resolution',
      'material_replacement'
    )
  );

-- Las escrituras de publicacion disparan varios triggers de version. Durante
-- esa transaccion se difieren y publish_compiler_run incrementa la version una
-- sola vez al final, cuando el estado completo ya es visible.
CREATE OR REPLACE FUNCTION public.bump_scope_tree_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF current_setting('app.defer_content_version', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  UPDATE public.scope_tree_version
  SET version = version + 1, updated_at = NOW()
  WHERE singleton = true;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE FUNCTION public.publish_compiler_run(
  run_uuid UUID,
  admin_uuid UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  compiler_run public.compiler_runs%ROWTYPE;
  proposal public.compiler_proposals%ROWTYPE;
  intent public.intent_configurations%ROWTYPE;
  previous_response public.bot_responses%ROWTYPE;
  response_uuid UUID;
  retired_response_count INTEGER := 0;
  retired_scope_count INTEGER := 0;
  published_count INTEGER := 0;
  affected_count INTEGER := 0;
BEGIN
  SELECT * INTO compiler_run
  FROM public.compiler_runs
  WHERE id = run_uuid
  FOR UPDATE;

  IF compiler_run.id IS NULL THEN
    RAISE EXCEPTION 'compiler run does not exist';
  END IF;

  IF compiler_run.status <> 'waiting_content_approval'
    OR compiler_run.current_stage <> 'review' THEN
    RAISE EXCEPTION 'compiler run is not ready to publish';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.admin_users AS admin
    WHERE admin.id = admin_uuid AND admin.is_active
  ) THEN
    RAISE EXCEPTION 'active administrator is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.compiler_proposals
    WHERE run_id = run_uuid AND approval_status = 'pending'
  ) THEN
    RAISE EXCEPTION 'compiler run has no reviewed content to publish';
  END IF;

  PERFORM set_config('app.defer_content_version', 'on', true);

  IF compiler_run.replacement_mode = 'replace' THEN
    WITH RECURSIVE affected_scopes AS (
      SELECT id FROM public.scopes WHERE id = compiler_run.scope_id
      UNION ALL
      SELECT child.id
      FROM public.scopes AS child
      JOIN affected_scopes AS parent ON child.parent_id = parent.id
    )
    UPDATE public.bot_responses AS response
    SET is_active = false,
        deactivated_at = NOW(),
        deactivated_by = admin_uuid,
        inactive_reason = 'material_replacement'
    FROM public.intent_configurations AS active_intent
    WHERE response.intent_id = active_intent.id
      AND response.is_active
      AND active_intent.scope_id IN (SELECT id FROM affected_scopes);
    GET DIAGNOSTICS retired_response_count = ROW_COUNT;

    WITH RECURSIVE affected_scopes AS (
      SELECT id FROM public.scopes WHERE id = compiler_run.scope_id
      UNION ALL
      SELECT child.id
      FROM public.scopes AS child
      JOIN affected_scopes AS parent ON child.parent_id = parent.id
    )
    UPDATE public.intent_configurations
    SET is_active = false, updated_at = NOW()
    WHERE scope_id IN (SELECT id FROM affected_scopes)
      AND is_active;

    WITH RECURSIVE approved_scopes AS (
      SELECT DISTINCT scope_id AS id
      FROM public.compiler_proposals
      WHERE run_id = run_uuid AND approval_status = 'pending'

      UNION

      SELECT scope.parent_id
      FROM public.scopes AS scope
      JOIN approved_scopes AS approved ON scope.id = approved.id
      WHERE scope.parent_id IS NOT NULL
        AND approved.id <> compiler_run.scope_id
    ), affected_scopes AS (
      SELECT id FROM public.scopes WHERE id = compiler_run.scope_id
      UNION ALL
      SELECT child.id
      FROM public.scopes AS child
      JOIN affected_scopes AS parent ON child.parent_id = parent.id
    )
    UPDATE public.scopes
    SET is_active = false, updated_at = NOW()
    WHERE id IN (SELECT id FROM affected_scopes)
      AND id <> compiler_run.scope_id
      AND id NOT IN (SELECT id FROM approved_scopes WHERE id IS NOT NULL)
      AND is_active;
    GET DIAGNOSTICS retired_scope_count = ROW_COUNT;
  END IF;

  -- Los alcances preparados por esta corrida permanecen invisibles hasta este
  -- momento. También cubre corridas antiguas cuyos alcances ya estaban activos.
  WITH RECURSIVE approved_scopes AS (
    SELECT DISTINCT scope_id AS id
    FROM public.compiler_proposals
    WHERE run_id = run_uuid AND approval_status = 'pending'

    UNION

    SELECT scope.parent_id
    FROM public.scopes AS scope
    JOIN approved_scopes AS approved ON scope.id = approved.id
    WHERE scope.parent_id IS NOT NULL
      AND approved.id <> compiler_run.scope_id
  )
  UPDATE public.scopes
  SET is_active = true, updated_at = NOW()
  WHERE id IN (SELECT id FROM approved_scopes WHERE id IS NOT NULL)
    AND NOT is_active;

  -- Los alias propuestos se conservan en metadata para que tambien formen
  -- parte de la publicacion atomica.
  INSERT INTO public.scope_aliases (scope_id, alias, normalized_alias)
  SELECT
    scope.id,
    alias.value,
    btrim(regexp_replace(
      translate(lower(alias.value), 'áéíóúüñ', 'aeiouun'),
      '[^a-z0-9]+',
      ' ',
      'g'
    ))
  FROM public.scopes AS scope
  CROSS JOIN LATERAL jsonb_array_elements_text(
    COALESCE(scope.metadata->'compiler_aliases', '[]'::jsonb)
  ) AS alias(value)
  WHERE scope.metadata->>'compiler_run_id' = run_uuid::TEXT
    AND length(btrim(alias.value)) > 0
  ON CONFLICT (scope_id, normalized_alias) DO NOTHING;

  FOR proposal IN
    SELECT *
    FROM public.compiler_proposals
    WHERE run_id = run_uuid AND approval_status = 'pending'
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    SELECT * INTO intent
    FROM public.intent_configurations
    WHERE id = proposal.intent_id
    FOR UPDATE;

    IF intent.id IS NULL THEN
      RAISE EXCEPTION 'proposal % references a missing intent', proposal.id;
    END IF;

    -- En modo anadir solo se sustituye la misma pregunta en el mismo alcance.
    IF compiler_run.replacement_mode = 'add' THEN
      UPDATE public.bot_responses
      SET is_active = false,
          deactivated_at = NOW(),
          deactivated_by = admin_uuid,
          inactive_reason = 'material_replacement'
      WHERE intent_id = proposal.intent_id AND is_active;
      GET DIAGNOSTICS affected_count = ROW_COUNT;
      retired_response_count := retired_response_count + affected_count;
    END IF;

    INSERT INTO public.bot_responses (
      intent_id, intent_name, response_key, message_text, response_type,
      variables, is_active, order_priority, origin, compiler_proposal_id,
      edited_by_human
    ) VALUES (
      proposal.intent_id, intent.intent_name, proposal.response_key,
      proposal.message_text, 'fragmented', '{}'::jsonb, true, 1,
      'compiler', proposal.id, proposal.edited_by_human
    )
    RETURNING id INTO response_uuid;

    INSERT INTO public.response_fact_dependencies (response_id, fact_id)
    SELECT response_uuid, fact_id
    FROM public.compiler_proposal_facts
    WHERE proposal_id = proposal.id;

    FOR previous_response IN
      SELECT * FROM public.bot_responses
      WHERE intent_id = proposal.intent_id
        AND id <> response_uuid
        AND inactive_reason = 'material_replacement'
        AND superseded_by_response_id IS NULL
    LOOP
      UPDATE public.bot_responses
      SET superseded_by_response_id = response_uuid
      WHERE id = previous_response.id;

      INSERT INTO public.response_replacements (
        previous_response_id, replacement_response_id, replaced_by, reason
      ) VALUES (
        previous_response.id, response_uuid, admin_uuid, 'compiler_approval'
      ) ON CONFLICT (previous_response_id) DO NOTHING;
    END LOOP;

    UPDATE public.intent_configurations
    SET is_active = true,
        keywords = ARRAY(
          SELECT DISTINCT value
          FROM jsonb_array_elements_text(
            COALESCE(proposal.matcher_patterns->'keywords', '[]'::jsonb)
          ) AS value
        ),
        synonyms = ARRAY(
          SELECT DISTINCT value
          FROM jsonb_array_elements_text(
            COALESCE(proposal.matcher_patterns->'synonyms', '[]'::jsonb)
          ) AS value
        ),
        typos = ARRAY(
          SELECT DISTINCT value
          FROM jsonb_array_elements_text(
            COALESCE(proposal.matcher_patterns->'typos', '[]'::jsonb)
          ) AS value
        ),
        phrases = ARRAY(
          SELECT DISTINCT value
          FROM jsonb_array_elements_text(
            COALESCE(proposal.matcher_patterns->'phrases', '[]'::jsonb)
          ) AS value
        ),
        updated_at = NOW()
    WHERE id = proposal.intent_id;

    UPDATE public.compiler_proposals
    SET approval_status = 'approved',
        approved_response_id = response_uuid,
        approved_by = admin_uuid,
        approved_at = NOW(),
        approved_with_signals = review_signals,
        updated_at = NOW()
    WHERE id = proposal.id;

    published_count := published_count + 1;
  END LOOP;

  UPDATE public.compiler_runs
  SET status = 'completed',
      current_stage = 'completed',
      completed_at = NOW(),
      last_error = NULL,
      updated_at = NOW()
  WHERE id = run_uuid;

  PERFORM set_config('app.defer_content_version', 'off', true);
  UPDATE public.scope_tree_version
  SET version = version + 1, updated_at = NOW()
  WHERE singleton = true;

  RETURN jsonb_build_object(
    'published_responses', published_count,
    'retired_responses', retired_response_count,
    'retired_scopes', retired_scope_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.publish_compiler_run(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_compiler_run(UUID, UUID)
  TO service_role;

DROP FUNCTION IF EXISTS public.resolve_response_collision(UUID, UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS public.resolve_response_collision(UUID, UUID, TEXT, UUID, UUID[]);
DROP FUNCTION IF EXISTS public.approve_compiler_proposal(UUID, UUID, JSONB);
DROP FUNCTION IF EXISTS public.approve_compiler_proposal(UUID, UUID, JSONB, BOOLEAN);
