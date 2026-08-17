-- Hace atomica la publicacion de contenido por alcance, conserva el historial
-- de sustituciones y agrega una version global barata para invalidar el arbol.
-- No modifica ni desactiva respuestas existentes: las colisiones previas
-- quedan visibles hasta que un administrador las resuelva expresamente.

ALTER TABLE public.bot_responses
  ADD COLUMN edited_by_human BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN superseded_by_response_id UUID REFERENCES public.bot_responses(id) ON DELETE SET NULL,
  ADD COLUMN deactivated_at TIMESTAMPTZ,
  ADD COLUMN deactivated_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  ADD COLUMN inactive_reason TEXT;

ALTER TABLE public.compiler_coverage
  ADD COLUMN placement_error TEXT;

CREATE TABLE public.response_replacements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  previous_response_id UUID NOT NULL REFERENCES public.bot_responses(id) ON DELETE RESTRICT,
  replacement_response_id UUID NOT NULL REFERENCES public.bot_responses(id) ON DELETE RESTRICT,
  replaced_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  replaced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT NOT NULL CHECK (reason IN ('compiler_approval', 'collision_resolution')),
  CONSTRAINT response_replacements_distinct_rows CHECK (previous_response_id <> replacement_response_id),
  CONSTRAINT response_replacements_previous_once UNIQUE (previous_response_id)
);

COMMENT ON TABLE public.response_replacements IS
  'Historial reversible de respuestas retiradas por una sustitucion confirmada.';

CREATE INDEX idx_response_replacements_replacement
  ON public.response_replacements(replacement_response_id);

ALTER TABLE public.response_replacements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_response_replacements"
  ON public.response_replacements FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "active_admin_read_response_replacements"
  ON public.response_replacements FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users AS admin
      WHERE admin.id = (SELECT auth.uid()) AND admin.is_active
    )
  );

GRANT SELECT ON TABLE public.response_replacements TO authenticated;
GRANT ALL ON TABLE public.response_replacements TO service_role;

CREATE TABLE public.scope_tree_version (
  singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton),
  version BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.scope_tree_version (singleton) VALUES (true);

ALTER TABLE public.scope_tree_version ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_read_scope_tree_version"
  ON public.scope_tree_version FOR SELECT TO service_role USING (true);

CREATE POLICY "active_admin_read_scope_tree_version"
  ON public.scope_tree_version FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users AS admin
      WHERE admin.id = (SELECT auth.uid()) AND admin.is_active
    )
  );

GRANT SELECT ON TABLE public.scope_tree_version TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bump_scope_tree_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.scope_tree_version
  SET version = version + 1, updated_at = NOW()
  WHERE singleton = true;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER bump_scope_tree_version_on_scopes
AFTER INSERT OR DELETE OR UPDATE OF parent_id, name, slug, scope_type, is_active
ON public.scopes
FOR EACH STATEMENT EXECUTE FUNCTION public.bump_scope_tree_version();

CREATE TRIGGER bump_scope_tree_version_on_intents
AFTER INSERT OR DELETE OR UPDATE
ON public.intent_configurations
FOR EACH STATEMENT EXECUTE FUNCTION public.bump_scope_tree_version();

CREATE TRIGGER bump_scope_tree_version_on_responses
AFTER INSERT OR DELETE OR UPDATE OF intent_id, is_active, message_text
ON public.bot_responses
FOR EACH STATEMENT EXECUTE FUNCTION public.bump_scope_tree_version();

-- Sustituye las propuestas pendientes de una corrida en una sola transaccion.
-- Si falta una intencion en el alcance destino se crea dentro de la misma
-- transaccion; cualquier error revierte tambien esas altas.
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
        true,
        false,
        false
      )
      ON CONFLICT (scope_id, intent_name) DO UPDATE
        SET is_active = true, updated_at = NOW()
      RETURNING id INTO resolved_intent_id;
    END IF;

    INSERT INTO public.compiler_proposals (
      run_id, coverage_id, scope_id, intent_id, response_key,
      message_text, matcher_patterns, review_signals
    ) VALUES (
      run_uuid,
      (item->>'coverage_id')::UUID,
      (item->>'scope_id')::UUID,
      resolved_intent_id,
      item->>'response_key',
      item->'message_text',
      COALESCE(item->'matcher_patterns', '{}'::jsonb),
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(item->'review_signals', '[]'::jsonb)))
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

DROP FUNCTION public.approve_compiler_proposal(UUID, UUID, JSONB);

CREATE FUNCTION public.approve_compiler_proposal(
  proposal_uuid UUID,
  admin_uuid UUID,
  approved_message JSONB DEFAULT NULL,
  confirm_replacement BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  proposal public.compiler_proposals%ROWTYPE;
  intent public.intent_configurations%ROWTYPE;
  previous_response public.bot_responses%ROWTYPE;
  response_uuid UUID;
  final_message JSONB;
  active_count INTEGER;
BEGIN
  SELECT * INTO proposal
  FROM public.compiler_proposals
  WHERE id = proposal_uuid
  FOR UPDATE;

  IF proposal.id IS NULL OR proposal.approval_status <> 'pending' THEN
    RAISE EXCEPTION 'compiler proposal is missing or was already reviewed';
  END IF;

  SELECT * INTO intent
  FROM public.intent_configurations
  WHERE id = proposal.intent_id;

  SELECT COUNT(*) INTO active_count
  FROM public.bot_responses
  WHERE intent_id = proposal.intent_id AND is_active;

  IF active_count > 0 AND NOT confirm_replacement THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'replacement_confirmation_required';
  END IF;

  final_message := COALESCE(approved_message, proposal.message_text);

  IF active_count > 0 THEN
    UPDATE public.bot_responses
    SET is_active = false,
        deactivated_at = NOW(),
        deactivated_by = admin_uuid,
        inactive_reason = 'compiler_replacement'
    WHERE intent_id = proposal.intent_id AND is_active;
  END IF;

  INSERT INTO public.bot_responses (
    intent_id, intent_name, response_key, message_text, response_type,
    variables, is_active, order_priority, origin, compiler_proposal_id,
    edited_by_human
  ) VALUES (
    proposal.intent_id, intent.intent_name, proposal.response_key, final_message,
    'fragmented', '{}'::jsonb, true, 1, 'compiler', proposal.id,
    approved_message IS NOT NULL AND approved_message IS DISTINCT FROM proposal.message_text
  )
  RETURNING id INTO response_uuid;

  FOR previous_response IN
    SELECT * FROM public.bot_responses
    WHERE intent_id = proposal.intent_id
      AND id <> response_uuid
      AND inactive_reason = 'compiler_replacement'
      AND deactivated_at IS NOT NULL
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

  INSERT INTO public.response_fact_dependencies (response_id, fact_id)
  SELECT response_uuid, fact_id
  FROM public.compiler_proposal_facts
  WHERE proposal_id = proposal.id;

  UPDATE public.intent_configurations
  SET keywords = ARRAY(
        SELECT DISTINCT value FROM unnest(
          COALESCE(keywords, '{}') ||
          ARRAY(SELECT jsonb_array_elements_text(COALESCE(proposal.matcher_patterns->'keywords', '[]'::jsonb)))
        ) AS value
      ),
      synonyms = ARRAY(
        SELECT DISTINCT value FROM unnest(
          COALESCE(synonyms, '{}') ||
          ARRAY(SELECT jsonb_array_elements_text(COALESCE(proposal.matcher_patterns->'synonyms', '[]'::jsonb)))
        ) AS value
      ),
      typos = ARRAY(
        SELECT DISTINCT value FROM unnest(
          COALESCE(typos, '{}') ||
          ARRAY(SELECT jsonb_array_elements_text(COALESCE(proposal.matcher_patterns->'typos', '[]'::jsonb)))
        ) AS value
      ),
      phrases = ARRAY(
        SELECT DISTINCT value FROM unnest(
          COALESCE(phrases, '{}') ||
          ARRAY(SELECT jsonb_array_elements_text(COALESCE(proposal.matcher_patterns->'phrases', '[]'::jsonb)))
        ) AS value
      ),
      updated_at = NOW()
  WHERE id = proposal.intent_id;

  UPDATE public.compiler_proposals
  SET message_text = final_message,
      approval_status = 'approved',
      approved_response_id = response_uuid,
      approved_by = admin_uuid,
      approved_at = NOW(),
      approved_with_signals = review_signals,
      edited_by_human = approved_message IS NOT NULL AND approved_message IS DISTINCT FROM proposal.message_text
  WHERE id = proposal.id;

  RETURN response_uuid;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_compiler_proposal(UUID, UUID, JSONB, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_compiler_proposal(UUID, UUID, JSONB, BOOLEAN)
  TO service_role;

-- Confirma como una sola respuesta una colision preexistente. Con `combine`
-- conserva cada texto en su orden como fragmentos; con `keep` conserva la fila
-- propuesta. Nada se ejecuta sin la accion explicita del administrador.
CREATE FUNCTION public.resolve_response_collision(
  intent_uuid UUID,
  admin_uuid UUID,
  strategy TEXT,
  keep_response_uuid UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  active_rows public.bot_responses[];
  row_item public.bot_responses%ROWTYPE;
  kept public.bot_responses%ROWTYPE;
  combined_fragments JSONB := '[]'::jsonb;
  result_uuid UUID;
BEGIN
  SELECT ARRAY_AGG(response ORDER BY response.order_priority, response.created_at, response.id)
  INTO active_rows
  FROM public.bot_responses AS response
  WHERE response.intent_id = intent_uuid AND response.is_active
  FOR UPDATE;

  IF COALESCE(array_length(active_rows, 1), 0) < 2 THEN
    RAISE EXCEPTION 'response collision no longer exists';
  END IF;

  IF strategy = 'keep' THEN
    SELECT * INTO kept
    FROM unnest(active_rows) AS response
    WHERE response.id = keep_response_uuid;
    IF kept.id IS NULL THEN RAISE EXCEPTION 'kept response is not active in this collision'; END IF;
    result_uuid := kept.id;
  ELSIF strategy = 'combine' THEN
    FOREACH row_item IN ARRAY active_rows LOOP
      IF row_item.response_type = 'fragmented' AND jsonb_typeof(row_item.message_text->'fragments') = 'array' THEN
        combined_fragments := combined_fragments || (row_item.message_text->'fragments');
      ELSE
        combined_fragments := combined_fragments || jsonb_build_array(jsonb_build_object(
          'type', 'text', 'content', row_item.message_text #>> '{}', 'delay', 0
        ));
      END IF;
    END LOOP;

    SELECT * INTO kept FROM unnest(active_rows) AS response LIMIT 1;
    INSERT INTO public.bot_responses (
      intent_id, intent_name, response_key, message_text, response_type,
      variables, is_active, order_priority, origin, edited_by_human
    ) VALUES (
      intent_uuid, kept.intent_name, 'main', jsonb_build_object('fragments', combined_fragments),
      'fragmented', '{}'::jsonb, true, 1, 'manual', true
    ) RETURNING id INTO result_uuid;
  ELSE
    RAISE EXCEPTION 'unknown collision resolution strategy';
  END IF;

  FOREACH row_item IN ARRAY active_rows LOOP
    IF row_item.id = result_uuid THEN CONTINUE; END IF;
    UPDATE public.bot_responses
    SET is_active = false,
        superseded_by_response_id = result_uuid,
        deactivated_at = NOW(),
        deactivated_by = admin_uuid,
        inactive_reason = 'collision_resolution'
    WHERE id = row_item.id;

    INSERT INTO public.response_replacements (
      previous_response_id, replacement_response_id, replaced_by, reason
    ) VALUES (
      row_item.id, result_uuid, admin_uuid, 'collision_resolution'
    ) ON CONFLICT (previous_response_id) DO NOTHING;
  END LOOP;

  RETURN result_uuid;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_response_collision(UUID, UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_response_collision(UUID, UUID, TEXT, UUID)
  TO service_role;
