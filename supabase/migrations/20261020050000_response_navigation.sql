-- Permite excluir navegación del contexto de IA sin inferirla ni reclasificar
-- respuestas existentes. No modifica el comportamiento del camino léxico.
ALTER TABLE public.bot_responses
  ADD COLUMN is_navigation BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.bot_responses.is_navigation IS
  'Respuesta de navegación que debe excluirse del contexto del modelo; la marca el administrador.';
