-- Migración: Corregir valores de direction en tabla conversations
-- Cambiar 'incoming' → 'inbound' y 'outgoing' → 'outbound'

UPDATE conversations
SET direction = 'inbound'
WHERE direction = 'incoming';

UPDATE conversations
SET direction = 'outbound'
WHERE direction = 'outgoing';

-- Agregar constraint para asegurar solo valores válidos
ALTER TABLE conversations
ADD CONSTRAINT conversations_direction_check 
CHECK (direction IN ('inbound', 'outbound'));

-- Crear índice para mejorar performance de queries por direction
CREATE INDEX IF NOT EXISTS idx_conversations_direction ON conversations(direction);
