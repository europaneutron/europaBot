-- ============================================
-- MIGRACIÓN 019: Allow Media-Only Responses
-- Fecha: 2025-11-20
-- Objetivo: Permitir respuestas de solo imagen/video sin texto obligatorio
-- ============================================

-- Hacer message_text opcional (permitir NULL)
ALTER TABLE bot_responses 
ALTER COLUMN message_text DROP NOT NULL;

-- Agregar constraint: debe tener texto O media (al menos uno)
ALTER TABLE bot_responses 
ADD CONSTRAINT message_text_or_media_required 
CHECK (
  message_text IS NOT NULL 
  OR media_url IS NOT NULL
);

-- Comentario para documentar el cambio
COMMENT ON CONSTRAINT message_text_or_media_required ON bot_responses IS 
'Asegura que cada respuesta tenga al menos texto o media (o ambos)';
