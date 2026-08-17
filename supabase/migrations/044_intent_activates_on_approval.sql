-- Una intencion que el compilador crea nace apagada y solo la enciende la
-- aprobacion.
--
-- Generar contenido es una etapa automatica: al terminarla, la intencion
-- quedaba activa con el vocabulario que escribio el modelo y sin ninguna
-- respuesta. El lead que hacia justo esa pregunta era entendido por el matcher
-- y recibia "Gracias por tu interes", que es peor que el fallback porque cierra
-- la conversacion en vez de admitir que no se sabe. Rechazar la propuesta
-- tampoco lo deshacia: la intencion se quedaba encendida para siempre.
--
-- Nada de esto es visible en la base hasta que alguien aprueba, que es la
-- regla de la que cuelga todo el compilador.

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

CREATE OR REPLACE FUNCTION public.approve_compiler_proposal(
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

  -- La aprobacion es lo que pone la pregunta en pie: enciende la intencion y
  -- publica su vocabulario en el mismo movimiento en que publica la respuesta.
  UPDATE public.intent_configurations
  SET is_active = true,
      keywords = ARRAY(
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
