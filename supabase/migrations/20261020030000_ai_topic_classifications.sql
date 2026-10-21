-- Conserva una salida por mensaje, incluso si el clasificador falla, y la señal
-- del matcher para comparar detectores sin cambiar todavía los checkpoints.
CREATE TABLE public.ai_topic_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id VARCHAR(255) NOT NULL UNIQUE,
  topics JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(topics) = 'array'),
  other_topic TEXT,
  discarded_topics JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(discarded_topics) = 'array'),
  matcher_topics JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(matcher_topics) = 'array'),
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.ai_topic_classifications IS
  'Resultado del clasificador y señal léxica por mensaje para calibrar la fuente del score.';
COMMENT ON COLUMN public.ai_topic_classifications.topics IS
  'Temas validados: intent_name, quote, clarity (clara o dudosa) y mentioned_scope_id (UUID o null para general).';
COMMENT ON COLUMN public.ai_topic_classifications.discarded_topics IS
  'Salidas descartadas con el candidato original y reason; se preservan incluso si su estructura es inválida.';
COMMENT ON COLUMN public.ai_topic_classifications.matcher_topics IS
  'Lista de nombres de intents detectados por el matcher sobre el mismo mensaje.';
COMMENT ON COLUMN public.ai_topic_classifications.failure_reason IS
  'Causa del fallo del clasificador; con fallo, topics queda vacío.';

CREATE INDEX idx_ai_topic_classifications_user_created
  ON public.ai_topic_classifications(user_id, created_at DESC);
CREATE INDEX idx_ai_topic_classifications_conversation
  ON public.ai_topic_classifications(conversation_id);

ALTER TABLE public.ai_topic_classifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_ai_topic_classifications"
  ON public.ai_topic_classifications FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- El panel consulta la auditoría; solo el backend escribe sus resultados.
CREATE POLICY "active_admin_read_ai_topic_classifications"
  ON public.ai_topic_classifications FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users AS admin
      WHERE admin.id = (SELECT auth.uid()) AND admin.is_active
    )
  );
