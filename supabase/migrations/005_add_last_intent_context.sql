-- Migración 005: Agregar contexto de último intent
-- Permite capturar respuestas positivas del usuario después de preguntas que ofrecen agendar

-- Agregar columnas para contexto de conversación
ALTER TABLE user_progress 
ADD COLUMN last_intent VARCHAR(50),
ADD COLUMN last_intent_at TIMESTAMP WITH TIME ZONE;

-- Comentarios
COMMENT ON COLUMN user_progress.last_intent IS 'Último intent detectado (usado para capturar respuestas positivas)';
COMMENT ON COLUMN user_progress.last_intent_at IS 'Timestamp del último intent (para validar contexto reciente)';

-- Índice para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_user_progress_last_intent ON user_progress(last_intent, last_intent_at) 
WHERE last_intent IS NOT NULL;
