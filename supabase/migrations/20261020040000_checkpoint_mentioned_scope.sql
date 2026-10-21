-- Separa el desarrollo mencionado del alcance raíz usado para contar el tema
-- una sola vez por lead. Conserva la unicidad y los checkpoints existentes.
ALTER TABLE public.user_checkpoints
  ADD COLUMN mentioned_scope_id UUID REFERENCES public.scopes(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.user_checkpoints.mentioned_scope_id IS
  'Desarrollo mencionado por el clasificador. NULL indica general o un checkpoint previo al camino con IA.';

CREATE INDEX idx_user_checkpoints_mentioned_scope
  ON public.user_checkpoints(mentioned_scope_id);
