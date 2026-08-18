-- Registra por que un vocabulario compilado requiere revision y evita que
-- una propuesta que no alcanza su propia pregunta llegue al runtime.
ALTER TABLE public.compiler_proposals
  ADD COLUMN is_publishable BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN review_details JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.compiler_proposals.is_publishable IS
  'La comprobacion determinista con FuzzyMatcher decide si puede publicarse.';
COMMENT ON COLUMN public.compiler_proposals.review_details IS
  'Frases alcanzadas, frases perdidas y pregunta comprobada para explicar la revision.';

CREATE OR REPLACE FUNCTION public.replace_scoped_compiler_proposals(
  run_uuid UUID,
  proposal_rows JSONB
)
RETURNS SETOF public.compiler_proposals
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  item JSONB;
  resolved_intent_id UUID;
  created_proposal public.compiler_proposals%ROWTYPE;
  fact_uuid UUID;
BEGIN
  DELETE FROM public.compiler_proposals
  WHERE run_id = run_uuid AND approval_status = 'pending';

  FOR item IN SELECT value FROM jsonb_array_elements(proposal_rows)
  LOOP
    resolved_intent_id := NULLIF(item->>'intent_id', '')::UUID;

    IF resolved_intent_id IS NULL THEN
      INSERT INTO public.intent_configurations (
        scope_id, intent_name, display_name, keywords, synonyms, typos,
        phrases, min_confidence, priority, response_template, response_type,
        is_active, is_checkpoint, is_strong_signal
      ) VALUES (
        (item->>'scope_id')::UUID,
        item->>'intent_name',
        item->>'display_name',
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(item->'matcher_patterns'->'keywords', '[]'::jsonb))),
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(item->'matcher_patterns'->'synonyms', '[]'::jsonb))),
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(item->'matcher_patterns'->'typos', '[]'::jsonb))),
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(item->'matcher_patterns'->'phrases', '[]'::jsonb))),
        COALESCE((item->>'min_confidence')::NUMERIC, 0.6),
        COALESCE((item->>'priority')::INTEGER, 0),
        NULL,
        'fragmented',
        false,
        false,
        false
      )
      -- Una intencion que ya existe conserva su estado. Reactivar aqui la que
      -- un administrador apago a proposito seria decidir por el, y ademas
      -- antes de que nadie apruebe nada.
      ON CONFLICT (scope_id, intent_name) DO UPDATE
        SET updated_at = NOW()
      RETURNING id INTO resolved_intent_id;
    END IF;

    INSERT INTO public.compiler_proposals (
      run_id, coverage_id, scope_id, intent_id, response_key,
      message_text, matcher_patterns, review_signals, is_publishable, review_details
    ) VALUES (
      run_uuid,
      (item->>'coverage_id')::UUID,
      (item->>'scope_id')::UUID,
      resolved_intent_id,
      item->>'response_key',
      item->'message_text',
      COALESCE(item->'matcher_patterns', '{}'::jsonb),
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(item->'review_signals', '[]'::jsonb))),
      COALESCE((item->>'is_publishable')::BOOLEAN, true),
      COALESCE(item->'review_details', '{}'::jsonb)
    )
    RETURNING * INTO created_proposal;

    FOR fact_uuid IN
      SELECT value::UUID
      FROM jsonb_array_elements_text(COALESCE(item->'fact_ids', '[]'::jsonb))
    LOOP
      INSERT INTO public.compiler_proposal_facts (proposal_id, fact_id)
      VALUES (created_proposal.id, fact_uuid);
    END LOOP;

    RETURN NEXT created_proposal;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_scoped_compiler_proposals(UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_scoped_compiler_proposals(UUID, JSONB)
  TO service_role;

CREATE OR REPLACE FUNCTION public.publish_compiler_run(
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
  published_intent_names TEXT[];
  retired_response_count INTEGER := 0;
  retired_scope_count INTEGER := 0;
  published_count INTEGER := 0;
  affected_count INTEGER := 0;
  blocked_count INTEGER := 0;
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

  -- Las preguntas que esta publicacion cubre. Se toman de lo que se va a
  -- publicar y no del catalogo, porque sustituir es sustituir por algo: si de
  -- una pregunta no queda nada que publicar --se rechazo al revisar-- retirar
  -- la anterior dejaria al bot mudo en ella.
  SELECT ARRAY_AGG(DISTINCT candidate.intent_name)
  INTO published_intent_names
  FROM public.compiler_proposals AS pending_proposal
  JOIN public.intent_configurations AS candidate ON candidate.id = pending_proposal.intent_id
  WHERE pending_proposal.run_id = run_uuid
    AND pending_proposal.approval_status = 'pending'
    AND pending_proposal.is_publishable;

  published_intent_names := COALESCE(published_intent_names, '{}');

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
      AND active_intent.scope_id IN (SELECT id FROM affected_scopes)
      AND active_intent.intent_name = ANY(published_intent_names);
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
      AND intent_name = ANY(published_intent_names)
      AND is_active;

    WITH RECURSIVE approved_scopes AS (
      SELECT DISTINCT scope_id AS id
      FROM public.compiler_proposals
      WHERE run_id = run_uuid AND approval_status = 'pending' AND is_publishable

      UNION

      -- Todo lo que esta corrida propuso como estructura, tenga contenido o no.
      SELECT scope.id
      FROM public.scopes AS scope
      WHERE scope.metadata->>'compiler_run_id' = run_uuid::TEXT

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

    SELECT scope.id
    FROM public.scopes AS scope
    WHERE scope.metadata->>'compiler_run_id' = run_uuid::TEXT

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
    WHERE run_id = run_uuid AND approval_status = 'pending' AND is_publishable
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

  UPDATE public.compiler_proposals
  SET approval_status = 'rejected',
      rejected_at = NOW(),
      updated_at = NOW()
  WHERE run_id = run_uuid
    AND approval_status = 'pending'
    AND NOT is_publishable;
  GET DIAGNOSTICS blocked_count = ROW_COUNT;

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
    'blocked_responses', blocked_count,
    'retired_responses', retired_response_count,
    'retired_scopes', retired_scope_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.publish_compiler_run(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_compiler_run(UUID, UUID)
  TO service_role;
