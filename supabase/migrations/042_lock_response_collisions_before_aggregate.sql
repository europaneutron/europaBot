-- Corrige el bloqueo de colisiones: PostgreSQL no permite FOR UPDATE sobre
-- una consulta agregada. Primero bloqueamos las filas y luego construimos el
-- arreglo ordenado dentro de la misma transaccion.

CREATE OR REPLACE FUNCTION public.resolve_response_collision(
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
