-- Convierte los hechos publicados por el compilador en estado editable del
-- negocio. La corrida conserva la historia; esta tabla conserva el valor
-- vigente que usa el runtime.

ALTER TABLE public.compiler_facts
  ADD COLUMN unit TEXT;

CREATE TABLE public.catalog_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id UUID NOT NULL REFERENCES public.scopes(id) ON DELETE CASCADE,
  value_key TEXT NOT NULL,
  value JSONB NOT NULL,
  value_type TEXT NOT NULL DEFAULT 'text'
    CHECK (value_type IN ('text', 'money', 'date', 'contractual', 'number', 'location')),
  unit TEXT,
  source_fact_id UUID REFERENCES public.compiler_facts(id) ON DELETE SET NULL,
  source_material_id UUID REFERENCES public.compiler_materials(id) ON DELETE SET NULL,
  source_page_number INTEGER CHECK (source_page_number IS NULL OR source_page_number > 0),
  edited_by_human BOOLEAN NOT NULL DEFAULT false,
  edited_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT catalog_values_scope_key UNIQUE (scope_id, value_key),
  CONSTRAINT catalog_values_key_not_blank CHECK (length(btrim(value_key)) > 0),
  CONSTRAINT catalog_values_human_edit_consistent CHECK (
    (NOT edited_by_human AND edited_by IS NULL AND edited_at IS NULL)
    OR (edited_by_human AND edited_at IS NOT NULL)
  )
);

COMMENT ON TABLE public.catalog_values IS
  'Estado vigente y editable de los datos comerciales, independiente de la corrida que los extrajo.';
COMMENT ON COLUMN public.catalog_values.source_fact_id IS
  'Hecho de la corrida que publicó el valor. Una edición humana conserva esta procedencia.';
COMMENT ON COLUMN public.catalog_values.edited_by_human IS
  'Indica que value fue corregido manualmente después de extraerse del material.';

CREATE INDEX idx_catalog_values_scope_key
  ON public.catalog_values(scope_id, value_key);
CREATE INDEX idx_catalog_values_source_fact
  ON public.catalog_values(source_fact_id);

CREATE TABLE public.response_catalog_dependencies (
  response_id UUID NOT NULL REFERENCES public.bot_responses(id) ON DELETE CASCADE,
  value_key TEXT NOT NULL,
  declared_scope_id UUID NOT NULL REFERENCES public.scopes(id) ON DELETE CASCADE,
  PRIMARY KEY (response_id, value_key),
  CONSTRAINT response_catalog_dependency_key_not_blank CHECK (length(btrim(value_key)) > 0)
);

COMMENT ON TABLE public.response_catalog_dependencies IS
  'Huecos que una respuesta necesita resolver contra el catalogo de su alcance.';

CREATE INDEX idx_response_catalog_dependencies_scope_key
  ON public.response_catalog_dependencies(declared_scope_id, value_key);

CREATE TRIGGER update_catalog_values_updated_at
BEFORE UPDATE ON public.catalog_values
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.catalog_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.response_catalog_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_catalog_values"
  ON public.catalog_values FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "active_admin_all_catalog_values"
  ON public.catalog_values FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users AS admin
      WHERE admin.id = (SELECT auth.uid()) AND admin.is_active
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users AS admin
      WHERE admin.id = (SELECT auth.uid()) AND admin.is_active
    )
  );

CREATE POLICY "service_role_all_response_catalog_dependencies"
  ON public.response_catalog_dependencies FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "active_admin_all_response_catalog_dependencies"
  ON public.response_catalog_dependencies FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users AS admin
      WHERE admin.id = (SELECT auth.uid()) AND admin.is_active
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users AS admin
      WHERE admin.id = (SELECT auth.uid()) AND admin.is_active
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_values TO authenticated;
GRANT ALL ON TABLE public.catalog_values TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.response_catalog_dependencies TO authenticated;
GRANT ALL ON TABLE public.response_catalog_dependencies TO service_role;

-- La dependencia se deriva del mensaje guardado para que tambien cubra
-- respuestas manuales y ediciones posteriores, no solo al compilador.
CREATE FUNCTION public.refresh_response_catalog_dependencies()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  response_scope_id UUID;
BEGIN
  DELETE FROM public.response_catalog_dependencies
  WHERE response_id = NEW.id;

  SELECT scope_id INTO response_scope_id
  FROM public.intent_configurations
  WHERE id = NEW.intent_id;

  INSERT INTO public.response_catalog_dependencies (
    response_id, value_key, declared_scope_id
  )
  SELECT NEW.id, token.matches[1], response_scope_id
  FROM (
    SELECT DISTINCT matches
    FROM regexp_matches(
      COALESCE(NEW.message_text::TEXT, ''),
      '\{([a-zA-Z0-9_]+)\}',
      'g'
    ) AS matches
  ) AS token
  WHERE response_scope_id IS NOT NULL;

  RETURN NEW;
END;
$$;

CREATE TRIGGER refresh_response_catalog_dependencies_after_write
AFTER INSERT OR UPDATE OF intent_id, message_text ON public.bot_responses
FOR EACH ROW EXECUTE FUNCTION public.refresh_response_catalog_dependencies();

-- Registra también los huecos de respuestas existentes. Las respuestas sin
-- tokens no generan filas y siguen funcionando como antes.
INSERT INTO public.response_catalog_dependencies (
  response_id, value_key, declared_scope_id
)
SELECT response.id, token.matches[1], intent.scope_id
FROM public.bot_responses AS response
JOIN public.intent_configurations AS intent ON intent.id = response.intent_id
CROSS JOIN LATERAL (
  SELECT DISTINCT matches
  FROM regexp_matches(
    COALESCE(response.message_text::TEXT, ''),
    '\{([a-zA-Z0-9_]+)\}',
    'g'
  ) AS matches
) AS token
WHERE intent.scope_id IS NOT NULL
ON CONFLICT (response_id, value_key) DO NOTHING;

-- Se ejecuta dentro de la misma transacción de publish_compiler_run. En
-- sustituir, el material vuelve a ser la verdad; en añadir, lo existente no
-- se toca. DISTINCT ON evita que una corrida contradictoria intente escribir
-- dos veces la misma clave y conserva el hecho de mayor confianza.
CREATE FUNCTION public.publish_compiler_catalog_values()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status <> 'completed'
    OR OLD.status = 'completed'
    OR NEW.current_stage <> 'completed' THEN
    RETURN NEW;
  END IF;

  IF NEW.replacement_mode = 'replace' THEN
    INSERT INTO public.catalog_values (
      scope_id, value_key, value, value_type, unit,
      source_fact_id, source_material_id, source_page_number,
      edited_by_human, edited_by, edited_at
    )
    SELECT DISTINCT ON (fact.scope_id, fact.fact_key)
      fact.scope_id,
      fact.fact_key,
      fact.fact_value,
      fact.fact_type,
      fact.unit,
      fact.id,
      fact.material_id,
      fact.page_number,
      false,
      NULL,
      NULL
    FROM public.compiler_facts AS fact
    WHERE fact.run_id = NEW.id
      AND NOT fact.is_contradictory
    ORDER BY fact.scope_id, fact.fact_key, fact.provenance_confidence DESC, fact.created_at DESC
    ON CONFLICT (scope_id, value_key) DO UPDATE
      SET value = EXCLUDED.value,
          value_type = EXCLUDED.value_type,
          unit = EXCLUDED.unit,
          source_fact_id = EXCLUDED.source_fact_id,
          source_material_id = EXCLUDED.source_material_id,
          source_page_number = EXCLUDED.source_page_number,
          edited_by_human = false,
          edited_by = NULL,
          edited_at = NULL,
          updated_at = NOW();
  ELSE
    INSERT INTO public.catalog_values (
      scope_id, value_key, value, value_type, unit,
      source_fact_id, source_material_id, source_page_number
    )
    SELECT DISTINCT ON (fact.scope_id, fact.fact_key)
      fact.scope_id,
      fact.fact_key,
      fact.fact_value,
      fact.fact_type,
      fact.unit,
      fact.id,
      fact.material_id,
      fact.page_number
    FROM public.compiler_facts AS fact
    WHERE fact.run_id = NEW.id
      AND NOT fact.is_contradictory
    ORDER BY fact.scope_id, fact.fact_key, fact.provenance_confidence DESC, fact.created_at DESC
    ON CONFLICT (scope_id, value_key) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER publish_compiler_catalog_values_on_completion
AFTER UPDATE OF status, current_stage ON public.compiler_runs
FOR EACH ROW EXECUTE FUNCTION public.publish_compiler_catalog_values();

-- El runtime usa scope_tree_version para fijar una fotografía coherente de
-- cada mensaje. Una edición del catálogo invalida esa misma fotografía.
CREATE TRIGGER bump_scope_tree_version_on_catalog_values
AFTER INSERT OR DELETE OR UPDATE OF scope_id, value_key, value, value_type, unit
ON public.catalog_values
FOR EACH STATEMENT EXECUTE FUNCTION public.bump_scope_tree_version();
