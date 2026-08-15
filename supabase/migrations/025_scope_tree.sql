-- Introduce el arbol de alcances y adopta el contenido existente bajo una raiz.
-- Es aditiva: las referencias antiguas de respuestas se conservan para rollback.

CREATE TABLE public.scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES public.scopes(id) ON DELETE RESTRICT,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(120) NOT NULL UNIQUE,
  scope_type VARCHAR(50) NOT NULL DEFAULT 'development',
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT scopes_parent_is_not_self CHECK (parent_id IS NULL OR parent_id <> id)
);

COMMENT ON TABLE public.scopes IS
  'Contextos jerarquicos usados para resolver contenido y configuracion por herencia.';
COMMENT ON COLUMN public.scopes.scope_type IS
  'Etiqueta informativa; la resolucion no depende del tipo ni de la profundidad.';

CREATE INDEX idx_scopes_parent ON public.scopes(parent_id);
CREATE INDEX idx_scopes_active ON public.scopes(is_active);

CREATE OR REPLACE FUNCTION public.prevent_scope_cycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  cycle_found BOOLEAN;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  WITH RECURSIVE ancestors AS (
    SELECT s.id, s.parent_id
    FROM public.scopes AS s
    WHERE s.id = NEW.parent_id

    UNION ALL

    SELECT s.id, s.parent_id
    FROM public.scopes AS s
    JOIN ancestors AS a ON s.id = a.parent_id
  )
  SELECT EXISTS (SELECT 1 FROM ancestors WHERE id = NEW.id)
  INTO cycle_found;

  IF cycle_found THEN
    RAISE EXCEPTION 'scope hierarchy cannot contain cycles';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_scope_cycle_before_write
BEFORE INSERT OR UPDATE OF parent_id ON public.scopes
FOR EACH ROW EXECUTE FUNCTION public.prevent_scope_cycle();

CREATE TRIGGER update_scopes_updated_at
BEFORE UPDATE ON public.scopes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.scopes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_scopes"
  ON public.scopes FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "admin_read_scopes"
  ON public.scopes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE admin_users.id = (SELECT auth.uid())
      AND admin_users.is_active = true
    )
  );

GRANT SELECT ON TABLE public.scopes TO authenticated;
GRANT ALL ON TABLE public.scopes TO service_role;

INSERT INTO public.scopes (id, name, slug, scope_type)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'Europa',
  'europa',
  'root'
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.intent_configurations
  ADD COLUMN scope_id UUID DEFAULT '00000000-0000-4000-8000-000000000001'
  REFERENCES public.scopes(id) ON DELETE RESTRICT;

UPDATE public.intent_configurations
SET scope_id = '00000000-0000-4000-8000-000000000001'
WHERE scope_id IS NULL;

CREATE INDEX idx_intent_configs_scope ON public.intent_configurations(scope_id);

ALTER TABLE public.resources
  ADD COLUMN scope_id UUID DEFAULT '00000000-0000-4000-8000-000000000001'
  REFERENCES public.scopes(id) ON DELETE RESTRICT;

UPDATE public.resources
SET scope_id = '00000000-0000-4000-8000-000000000001'
WHERE scope_id IS NULL;

CREATE INDEX idx_resources_scope ON public.resources(scope_id);

ALTER TABLE public.appointment_config
  ADD COLUMN scope_id UUID DEFAULT '00000000-0000-4000-8000-000000000001'
  REFERENCES public.scopes(id) ON DELETE RESTRICT;

UPDATE public.appointment_config
SET scope_id = '00000000-0000-4000-8000-000000000001'
WHERE scope_id IS NULL;

ALTER TABLE public.appointment_config
  DROP CONSTRAINT appointment_config_time_slot_key;

ALTER TABLE public.appointment_config
  ADD CONSTRAINT appointment_config_scope_time_slot_key
  UNIQUE NULLS NOT DISTINCT (scope_id, time_slot);

CREATE INDEX idx_appointment_config_scope ON public.appointment_config(scope_id);

ALTER TABLE public.agent_config
  ADD COLUMN scope_id UUID DEFAULT '00000000-0000-4000-8000-000000000001'
  REFERENCES public.scopes(id) ON DELETE RESTRICT;

UPDATE public.agent_config
SET scope_id = '00000000-0000-4000-8000-000000000001'
WHERE scope_id IS NULL;

-- Deduplicar antes de imponer la unicidad. Hasta ahora nada impedia tener dos
-- filas activas: la lectura usaba .single(), que fallaba en silencio y caia a
-- un valor por defecto, asi que una base con duplicados es indetectable desde
-- la aplicacion. Sin este paso, la migracion abortaria a medias en ese caso.
-- Se conserva la fila mas reciente de cada alcance.
UPDATE public.agent_config
SET is_active = false, updated_at = NOW()
WHERE is_active = true
  AND id NOT IN (
    SELECT DISTINCT ON (scope_id) id
    FROM public.agent_config
    WHERE is_active = true
    ORDER BY scope_id, created_at DESC, id DESC
  );

CREATE UNIQUE INDEX agent_config_one_active_per_scope
  ON public.agent_config(scope_id) NULLS NOT DISTINCT
  WHERE is_active = true;

CREATE INDEX idx_agent_config_scope ON public.agent_config(scope_id);
