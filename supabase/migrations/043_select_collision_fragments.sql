-- Permite decidir que filas forman la secuencia conservada. Una colision puede
-- contener una respuesta anterior, una compilada y un seguimiento; combinar
-- las tres enviaria dos versiones del dato. La seleccion explicita conserva
-- solo la principal elegida y los seguimientos que la persona confirme.

DROP FUNCTION public.resolve_response_collision(UUID, UUID, TEXT, UUID);

CREATE FUNCTION public.resolve_response_collision(
  intent_uuid UUID,
  admin_uuid UUID,
  strategy TEXT,
  keep_response_uuid UUID DEFAULT NULL,
  combine_response_uuids UUID[] DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  active_rows public.bot_responses[];
  selected_rows public.bot_responses[];
  row_item public.bot_responses%ROWTYPE;
  kept public.bot_responses%ROWTYPE;
  combined_fragments JSONB := '[]'::jsonb;
  result_uuid UUID;
BEGIN
  PERFORM response.id
  FROM public.bot_responses AS response
  WHERE response.intent_id = intent_uuid AND response.is_active
  FOR UPDATE;

  SELECT ARRAY_AGG(response ORDER BY response.order_priority, response.created_at, response.id)
  INTO active_rows
  FROM public.bot_responses AS response
  WHERE response.intent_id = intent_uuid AND response.is_active;

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
    SELECT ARRAY_AGG(response ORDER BY response.order_priority, response.created_at, response.id)
    INTO selected_rows
    FROM unnest(active_rows) AS response
    WHERE response.id = ANY(COALESCE(combine_response_uuids, '{}'));

    IF COALESCE(array_length(selected_rows, 1), 0) < 2
       OR array_length(selected_rows, 1) <> array_length(combine_response_uuids, 1) THEN
      RAISE EXCEPTION 'at least two active responses must be selected for combination';
    END IF;

    FOREACH row_item IN ARRAY selected_rows LOOP
      IF row_item.response_type = 'fragmented' AND jsonb_typeof(row_item.message_text->'fragments') = 'array' THEN
        combined_fragments := combined_fragments || (row_item.message_text->'fragments');
      ELSE
        combined_fragments := combined_fragments || jsonb_build_array(jsonb_build_object(
          'type', 'text', 'content', row_item.message_text #>> '{}', 'delay', 0
        ));
      END IF;
    END LOOP;

    SELECT * INTO kept FROM unnest(selected_rows) AS response LIMIT 1;
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

REVOKE ALL ON FUNCTION public.resolve_response_collision(UUID, UUID, TEXT, UUID, UUID[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_response_collision(UUID, UUID, TEXT, UUID, UUID[])
  TO service_role;

