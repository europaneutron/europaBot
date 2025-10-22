-- =====================================================
-- Migración 003: Soporte para Mensajes Fragmentados
-- =====================================================
-- Fecha: 2025-10-22
-- Objetivo: Permitir mensajes simples (texto) y fragmentados (multimedia)
-- Retrocompatibilidad: Mensajes existentes siguen funcionando

-- =====================================================
-- PASO 1: Agregar columna response_type
-- =====================================================
-- Esta columna define si la respuesta es 'simple' (texto plano) o 'fragmented' (JSON con fragments)

ALTER TABLE bot_responses 
ADD COLUMN IF NOT EXISTS response_type VARCHAR(20) DEFAULT 'simple' 
CHECK (response_type IN ('simple', 'fragmented'));

COMMENT ON COLUMN bot_responses.response_type IS 'Tipo de respuesta: simple (texto) o fragmented (JSON con multimedia)';

-- =====================================================
-- PASO 2: Crear índice para búsquedas por tipo
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_bot_responses_type ON bot_responses(response_type);

-- =====================================================
-- PASO 3: Convertir message_text a JSONB
-- =====================================================
-- IMPORTANTE: Esta conversión mantiene los strings existentes
-- PostgreSQL automáticamente convierte "texto" a JSONB como una string JSON válida

-- Primero, crear una columna temporal
ALTER TABLE bot_responses 
ADD COLUMN IF NOT EXISTS message_text_new JSONB;

-- Copiar datos existentes convirtiéndolos a JSONB
-- Los strings se convierten a strings JSON válidos (con comillas)
UPDATE bot_responses 
SET message_text_new = to_jsonb(message_text);

-- Eliminar columna antigua
ALTER TABLE bot_responses 
DROP COLUMN message_text;

-- Renombrar nueva columna
ALTER TABLE bot_responses 
RENAME COLUMN message_text_new TO message_text;

-- Agregar constraint NOT NULL
ALTER TABLE bot_responses 
ALTER COLUMN message_text SET NOT NULL;

COMMENT ON COLUMN bot_responses.message_text IS 'Contenido del mensaje: string simple o JSON con fragments array';

-- =====================================================
-- VERIFICACIÓN: Ver estructura actualizada
-- =====================================================
-- SELECT 
--   intent_name, 
--   response_type, 
--   message_text,
--   jsonb_typeof(message_text) as message_type
-- FROM bot_responses 
-- LIMIT 5;

-- =====================================================
-- NOTAS IMPORTANTES
-- =====================================================
-- 1. Todos los mensajes existentes ahora son JSONB tipo "string"
-- 2. Para usar formato fragmentado, cambiar response_type a 'fragmented'
--    y message_text debe ser un objeto JSON con estructura:
--    {
--      "fragments": [
--        {
--          "type": "text|image|video|document|location|audio|contact",
--          "content": "...",
--          "delay": 1000
--        }
--      ]
--    }
-- 3. El código TypeScript debe manejar ambos formatos
-- 4. Esta migración es REVERSIBLE (se puede hacer rollback)
