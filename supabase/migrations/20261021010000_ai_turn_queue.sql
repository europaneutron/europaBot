-- Objetivo: serializar los turnos del camino con IA de un mismo usuario. Varios mensajes
-- seguidos de una persona llegan como invocaciones serverless distintas; sin orden cada
-- una contesta sin ver las otras y las respuestas pueden llegar invertidas.
-- Impacto: tabla nueva y dos funciones; no altera tablas existentes. Es una cola FIFO por
-- usuario: un turno espera a que no haya otro anterior vigente. Las filas con más de
-- p_stale_seconds se ignoran, de modo que un turno que murió no bloquea a nadie.
CREATE TABLE public.ai_turn_queue (
  message_id VARCHAR(255) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  enqueued_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

COMMENT ON TABLE public.ai_turn_queue IS
  'Cola efímera por usuario que ordena los turnos del camino con IA; se borra al terminar cada turno.';

CREATE INDEX idx_ai_turn_queue_user_enqueued
  ON public.ai_turn_queue(user_id, enqueued_at);

ALTER TABLE public.ai_turn_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_ai_turn_queue"
  ON public.ai_turn_queue FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- El panel no necesita esta tabla: es estado operativo del backend.

CREATE FUNCTION public.enqueue_ai_turn(p_user_id UUID, p_message_id TEXT, p_stale_seconds INT)
RETURNS VOID
LANGUAGE sql
SET search_path = ''
AS $$
  DELETE FROM public.ai_turn_queue
   WHERE user_id = p_user_id
     AND enqueued_at < clock_timestamp() - make_interval(secs => p_stale_seconds);
  INSERT INTO public.ai_turn_queue (message_id, user_id)
  VALUES (p_message_id, p_user_id)
  ON CONFLICT (message_id) DO NOTHING;
$$;

CREATE FUNCTION public.is_ai_turn_next(p_user_id UUID, p_message_id TEXT, p_stale_seconds INT)
RETURNS BOOLEAN
LANGUAGE sql
SET search_path = ''
STABLE
AS $$
  SELECT NOT EXISTS (
    SELECT 1
      FROM public.ai_turn_queue AS ahead
      JOIN public.ai_turn_queue AS own ON own.message_id = p_message_id
     WHERE ahead.user_id = p_user_id
       AND ahead.message_id <> p_message_id
       AND ahead.enqueued_at < own.enqueued_at
       AND ahead.enqueued_at > clock_timestamp() - make_interval(secs => p_stale_seconds)
  );
$$;

REVOKE ALL ON FUNCTION public.enqueue_ai_turn(UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_ai_turn_next(UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_ai_turn(UUID, TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_ai_turn_next(UUID, TEXT, INT) TO service_role;
