-- Migra bot_responses a la referencia estable por identificador.
-- intent_name permanece durante una ventana de compatibilidad y se retirara
-- solo despues de verificar el despliegue en produccion.

ALTER TABLE public.bot_responses
  ADD COLUMN intent_id UUID;

UPDATE public.bot_responses AS response
SET intent_id = intent.id
FROM public.intent_configurations AS intent
WHERE intent.intent_name = response.intent_name;

DO $$
DECLARE
  orphan_count BIGINT;
  fallback_intent_id UUID;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM public.bot_responses
  WHERE intent_id IS NULL;

  IF orphan_count > 0 THEN
    SELECT id INTO fallback_intent_id
    FROM public.intent_configurations
    WHERE intent_name = 'legacy_orphaned_response';

    IF fallback_intent_id IS NULL THEN
      INSERT INTO public.intent_configurations (
        scope_id,
        intent_name,
        display_name,
        keywords,
        is_active,
        is_checkpoint
      ) VALUES (
        '00000000-0000-4000-8000-000000000001',
        'legacy_orphaned_response',
        'Legacy orphaned responses',
        '{}',
        false,
        false
      )
      RETURNING id INTO fallback_intent_id;
    END IF;

    UPDATE public.bot_responses
    SET intent_id = fallback_intent_id,
        intent_name = 'legacy_orphaned_response'
    WHERE intent_id IS NULL;

    RAISE NOTICE 'Migration 026 preserved % orphaned bot_responses under intent legacy_orphaned_response', orphan_count;
  END IF;

  SELECT COUNT(*) INTO orphan_count
  FROM public.bot_responses
  WHERE intent_id IS NULL;

  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Migration 026 cannot enforce bot_responses.intent_id: % rows remain unresolved. Inspect their legacy intent_name values and map them to intent_configurations before retrying.', orphan_count;
  END IF;
END;
$$;

ALTER TABLE public.bot_responses
  ADD CONSTRAINT bot_responses_intent_id_fkey
  FOREIGN KEY (intent_id)
  REFERENCES public.intent_configurations(id)
  ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.sync_bot_response_intent_reference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  resolved_intent public.intent_configurations%ROWTYPE;
  matching_intent_count INTEGER;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.intent_id IS NOT NULL
     AND NEW.intent_name IS DISTINCT FROM OLD.intent_name THEN
    RAISE EXCEPTION 'Cannot update legacy intent_name on a bot response that already has intent_id; update intent_id instead';
  END IF;

  IF NEW.intent_id IS NOT NULL THEN
    SELECT * INTO resolved_intent
    FROM public.intent_configurations
    WHERE id = NEW.intent_id;
  ELSIF NEW.intent_name IS NOT NULL THEN
    SELECT COUNT(*) INTO matching_intent_count
    FROM public.intent_configurations
    WHERE intent_name = NEW.intent_name;

    IF matching_intent_count > 1 THEN
      RAISE EXCEPTION 'Legacy intent_name "%" is ambiguous across % scopes; provide intent_id', NEW.intent_name, matching_intent_count;
    END IF;

    SELECT * INTO resolved_intent
    FROM public.intent_configurations
    WHERE intent_name = NEW.intent_name
    LIMIT 1;
  END IF;

  IF resolved_intent.id IS NULL THEN
    RAISE EXCEPTION 'bot response must reference an existing intent through intent_id or an unambiguous legacy intent_name';
  END IF;

  NEW.intent_id := resolved_intent.id;
  NEW.intent_name := resolved_intent.intent_name;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_bot_response_intent_reference_before_write
BEFORE INSERT OR UPDATE OF intent_id, intent_name ON public.bot_responses
FOR EACH ROW EXECUTE FUNCTION public.sync_bot_response_intent_reference();

ALTER TABLE public.bot_responses
  ALTER COLUMN intent_id SET NOT NULL;

ALTER TABLE public.bot_responses
  DROP CONSTRAINT bot_responses_intent_name_fkey;

ALTER TABLE public.intent_configurations
  DROP CONSTRAINT intent_configurations_intent_name_key;

ALTER TABLE public.intent_configurations
  ADD CONSTRAINT intent_configurations_scope_name_key
  UNIQUE NULLS NOT DISTINCT (scope_id, intent_name);

CREATE INDEX idx_bot_responses_intent_id ON public.bot_responses(intent_id);

COMMENT ON COLUMN public.bot_responses.intent_name IS
  'Referencia heredada para rollback; retirar en una migracion posterior al despliegue verificado.';
COMMENT ON COLUMN public.bot_responses.intent_id IS
  'Referencia canonica a la intencion propietaria de la respuesta.';
