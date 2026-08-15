-- Agrega ruteo determinista por anuncio, alias y foco conversacional.
-- El cambio es aditivo: el codigo anterior puede seguir operando desde la raiz.

CREATE TABLE public.scope_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id VARCHAR(255) NOT NULL UNIQUE,
  scope_id UUID NOT NULL REFERENCES public.scopes(id) ON DELETE CASCADE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.scope_ads IS
  'Asocia identificadores de anuncios de Meta con el alcance que originan.';

CREATE INDEX idx_scope_ads_scope ON public.scope_ads(scope_id);

CREATE TRIGGER update_scope_ads_updated_at
BEFORE UPDATE ON public.scope_ads
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.scope_ads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_scope_ads"
  ON public.scope_ads FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "admin_read_scope_ads"
  ON public.scope_ads FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE admin_users.id = (SELECT auth.uid())
        AND admin_users.is_active = true
    )
  );

CREATE TABLE public.scope_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id UUID NOT NULL REFERENCES public.scopes(id) ON DELETE CASCADE,
  alias VARCHAR(160) NOT NULL,
  normalized_alias VARCHAR(160) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT scope_aliases_scope_normalized_key UNIQUE (scope_id, normalized_alias),
  CONSTRAINT scope_aliases_not_blank CHECK (length(btrim(normalized_alias)) > 0)
);

COMMENT ON TABLE public.scope_aliases IS
  'Nombres reconocibles de un alcance. Un mismo alias puede pertenecer a varios alcances; esa ambiguedad se resuelve en conversacion.';

CREATE INDEX idx_scope_aliases_scope ON public.scope_aliases(scope_id);
CREATE INDEX idx_scope_aliases_normalized ON public.scope_aliases(normalized_alias);

ALTER TABLE public.scope_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_scope_aliases"
  ON public.scope_aliases FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "admin_read_scope_aliases"
  ON public.scope_aliases FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE admin_users.id = (SELECT auth.uid())
        AND admin_users.is_active = true
    )
  );

GRANT SELECT ON TABLE public.scope_ads, public.scope_aliases TO authenticated;
GRANT ALL ON TABLE public.scope_ads, public.scope_aliases TO service_role;

ALTER TABLE public.user_sessions
  ADD COLUMN current_scope_id UUID REFERENCES public.scopes(id) ON DELETE SET NULL,
  ADD COLUMN previous_scope_id UUID REFERENCES public.scopes(id) ON DELETE SET NULL,
  ADD COLUMN scope_focus_updated_at TIMESTAMPTZ,
  ADD COLUMN pending_scope_message TEXT,
  ADD COLUMN pending_scope_intent_name VARCHAR(50),
  ADD COLUMN pending_scope_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.user_sessions.pending_scope_updated_at IS
  'Momento en que se planteo la desambiguacion. La pregunta retenida caduca con la misma ventana que el foco: responderla dias despues seria contestar algo que el lead ya no esta preguntando.';

CREATE INDEX idx_user_sessions_current_scope ON public.user_sessions(current_scope_id);

ALTER TABLE public.conversations
  ADD COLUMN scope_id UUID REFERENCES public.scopes(id) ON DELETE SET NULL,
  ADD COLUMN referral_ad_id VARCHAR(255);

CREATE INDEX idx_conversations_scope ON public.conversations(scope_id);
CREATE INDEX idx_conversations_referral_ad ON public.conversations(referral_ad_id)
  WHERE referral_ad_id IS NOT NULL;

INSERT INTO public.bot_config (
  config_key,
  config_value,
  config_type,
  description,
  category,
  is_editable
) VALUES
  (
    'scope_disambiguation_message',
    '¿De cuál desarrollo te gustaría recibir información?\n\n{alcances}',
    'string',
    'Pregunta para precisar el alcance. Variables disponibles: {alcances}',
    'system_messages',
    true
  ),
  (
    'scope_presentation_message',
    'Estos son los desarrollos disponibles:\n\n{alcances}\n\n¿Cuál te interesa?',
    'string',
    'Presentación de alcances en el saludo. Variables disponibles: {alcances}',
    'system_messages',
    true
  )
ON CONFLICT (config_key) DO NOTHING;
