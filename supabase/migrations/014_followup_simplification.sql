-- Migración 014: Simplificación del sistema de follow-up
-- Fecha: 2025-11-07
-- Descripción: Agregar flag permanente para tracking de follow-ups

-- Agregar columna followup_sent a users
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS followup_sent BOOLEAN DEFAULT false;

-- Índice para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_users_followup_sent 
ON users(followup_sent) 
WHERE followup_sent = false;

-- Comentario explicativo
COMMENT ON COLUMN users.followup_sent IS 'Indica si el usuario ya recibió mensaje de follow-up. Una vez enviado, nunca se vuelve a considerar.';
