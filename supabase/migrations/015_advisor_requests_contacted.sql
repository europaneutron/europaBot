-- Agregar columna contacted a advisor_requests
ALTER TABLE advisor_requests 
ADD COLUMN IF NOT EXISTS contacted BOOLEAN DEFAULT false;

-- Índice para filtros
CREATE INDEX IF NOT EXISTS idx_advisor_requests_contacted 
ON advisor_requests(contacted) WHERE contacted = false;

-- Actualizar registros existentes: si contacted_at no es null, marcar como contacted
UPDATE advisor_requests 
SET contacted = true 
WHERE contacted_at IS NOT NULL;
