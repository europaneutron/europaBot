-- Registra cada llamada, incluidos reintentos y fallos, para medir costo y respaldo.
-- No impone unicidad por mensaje: las tools pueden requerir varias llamadas.
CREATE TABLE public.ai_model_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id VARCHAR(255) NOT NULL,
  call_type TEXT NOT NULL CHECK (call_type IN ('responder', 'classifier')),
  model TEXT NOT NULL,
  input_tokens INTEGER CHECK (input_tokens >= 0),
  cache_read_input_tokens INTEGER CHECK (cache_read_input_tokens >= 0),
  cache_creation_input_tokens INTEGER CHECK (cache_creation_input_tokens >= 0),
  output_tokens INTEGER CHECK (output_tokens >= 0),
  latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
  tools_called JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(tools_called) = 'array'),
  guards_applied JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(guards_applied) = 'array'),
  fallback_reason TEXT,
  error_type TEXT,
  context_size_chars INTEGER NOT NULL CHECK (context_size_chars >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.ai_model_calls IS
  'Auditoría de llamadas del contestador y clasificador, sin guardar prompts ni respuestas.';
COMMENT ON COLUMN public.ai_model_calls.context_size_chars IS
  'Tamaño del contexto armado en caracteres; input_tokens mide los tokens reportados por el proveedor.';
COMMENT ON COLUMN public.ai_model_calls.input_tokens IS
  'NULL si el proveedor no reportó consumo, por ejemplo al agotarse el tiempo.';
COMMENT ON COLUMN public.ai_model_calls.conversation_id IS
  'Opcional para registrar llamadas antes de persistir la conversación; message_id identifica el mensaje entrante.';

CREATE INDEX idx_ai_model_calls_user_created ON public.ai_model_calls(user_id, created_at DESC);
CREATE INDEX idx_ai_model_calls_message ON public.ai_model_calls(message_id);
CREATE INDEX idx_ai_model_calls_conversation ON public.ai_model_calls(conversation_id);

ALTER TABLE public.ai_model_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_ai_model_calls"
  ON public.ai_model_calls FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- El panel consulta la auditoría; solo el backend escribe sus resultados.
CREATE POLICY "active_admin_read_ai_model_calls"
  ON public.ai_model_calls FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users AS admin
      WHERE admin.id = (SELECT auth.uid()) AND admin.is_active
    )
  );
