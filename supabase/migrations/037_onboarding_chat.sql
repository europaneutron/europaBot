-- Agrega la configuracion de marca y el estado reanudable del recorrido.
-- Es aditiva: el runtime conserva sus respuestas actuales hasta que un cliente
-- complete el recorrido y publique contenido nuevo.

CREATE TYPE public.onboarding_status AS ENUM ('in_progress', 'completed', 'abandoned');

CREATE TABLE public.client_brand_config (
  root_scope_id UUID PRIMARY KEY REFERENCES public.scopes(id) ON DELETE CASCADE,
  project_singular VARCHAR(80) NOT NULL DEFAULT 'desarrollo',
  project_plural VARCHAR(80) NOT NULL DEFAULT 'desarrollos',
  tone VARCHAR(30) NOT NULL DEFAULT 'friendly',
  is_configured BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT client_brand_project_singular_not_blank
    CHECK (length(btrim(project_singular)) > 0),
  CONSTRAINT client_brand_project_plural_not_blank
    CHECK (length(btrim(project_plural)) > 0),
  CONSTRAINT client_brand_tone_valid
    CHECK (tone IN ('friendly', 'direct', 'formal'))
);

COMMENT ON TABLE public.client_brand_config IS
  'Vocabulario y tono que el cliente elige. El compilador los consume al redactar y la interfaz al presentar sus proyectos.';
COMMENT ON COLUMN public.client_brand_config.is_configured IS
  'Permite preservar literalmente los mensajes existentes hasta que el cliente elija su vocabulario.';

CREATE TRIGGER update_client_brand_config_updated_at
BEFORE UPDATE ON public.client_brand_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.client_brand_config (root_scope_id)
VALUES ('00000000-0000-4000-8000-000000000001')
ON CONFLICT (root_scope_id) DO NOTHING;

CREATE TABLE public.onboarding_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  status public.onboarding_status NOT NULL DEFAULT 'in_progress',
  current_step SMALLINT NOT NULL DEFAULT 1,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  scope_id UUID REFERENCES public.scopes(id) ON DELETE SET NULL,
  run_id UUID REFERENCES public.compiler_runs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT onboarding_current_step_valid CHECK (current_step BETWEEN 1 AND 7),
  CONSTRAINT onboarding_completion_consistent CHECK (
    (status = 'completed' AND completed_at IS NOT NULL)
    OR (status <> 'completed' AND completed_at IS NULL)
  )
);

COMMENT ON TABLE public.onboarding_sessions IS
  'Avance reanudable del chat de alta. answers guarda solo decisiones deterministas; el material vive en las tablas del compilador.';

CREATE UNIQUE INDEX onboarding_one_active_session_per_admin
  ON public.onboarding_sessions(admin_id)
  WHERE status = 'in_progress';
CREATE INDEX idx_onboarding_sessions_run ON public.onboarding_sessions(run_id)
  WHERE run_id IS NOT NULL;

CREATE TRIGGER update_onboarding_sessions_updated_at
BEFORE UPDATE ON public.onboarding_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.client_brand_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_client_brand_config"
  ON public.client_brand_config FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "active_admin_all_client_brand_config"
  ON public.client_brand_config FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users AS admin
      WHERE admin.id = (SELECT auth.uid()) AND admin.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users AS admin
      WHERE admin.id = (SELECT auth.uid()) AND admin.is_active = true
    )
  );

CREATE POLICY "service_role_all_onboarding_sessions"
  ON public.onboarding_sessions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "active_admin_own_onboarding_sessions"
  ON public.onboarding_sessions FOR ALL
  TO authenticated
  USING (
    admin_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.admin_users AS admin
      WHERE admin.id = (SELECT auth.uid()) AND admin.is_active = true
    )
  )
  WITH CHECK (
    admin_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.admin_users AS admin
      WHERE admin.id = (SELECT auth.uid()) AND admin.is_active = true
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.client_brand_config,
  public.onboarding_sessions
TO authenticated;

GRANT ALL ON TABLE
  public.client_brand_config,
  public.onboarding_sessions
TO service_role;
