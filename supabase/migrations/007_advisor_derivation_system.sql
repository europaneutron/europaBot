-- Migración 007: Sistema de Derivación a Asesor Humano
-- Implementa flujo de captura de nombre y notificación al equipo de ventas

-- ============================================
-- 1. Agregar campo de espera de nombre en user_sessions
-- ============================================
ALTER TABLE user_sessions
ADD COLUMN awaiting_advisor_name BOOLEAN DEFAULT false;

COMMENT ON COLUMN user_sessions.awaiting_advisor_name IS 
'Indica si el usuario está en proceso de derivación y el siguiente mensaje será su nombre';

-- ============================================
-- 2. Crear tabla de solicitudes de asesor
-- ============================================
CREATE TABLE advisor_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  -- Contexto de la solicitud
  request_reason VARCHAR(100) DEFAULT 'fallback_limit',
  last_user_message TEXT,
  fallback_count INTEGER,
  lead_score INTEGER,
  checkpoints_completed INTEGER,
  
  -- Estado de atención
  status VARCHAR(20) DEFAULT 'pending',
  assigned_to VARCHAR(100),
  contacted_at TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para consultas eficientes
CREATE INDEX idx_advisor_requests_user ON advisor_requests(user_id);
CREATE INDEX idx_advisor_requests_status ON advisor_requests(status);
CREATE INDEX idx_advisor_requests_created ON advisor_requests(created_at DESC);

-- Constraint para validar status
ALTER TABLE advisor_requests
ADD CONSTRAINT advisor_requests_status_check 
CHECK (status IN ('pending', 'contacted', 'resolved', 'cancelled'));

-- Trigger para actualizar updated_at automáticamente
CREATE TRIGGER update_advisor_requests_updated_at 
BEFORE UPDATE ON advisor_requests
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comentarios de documentación
COMMENT ON TABLE advisor_requests IS 'Solicitudes de contacto con asesor humano (derivaciones del bot)';
COMMENT ON COLUMN advisor_requests.request_reason IS 'Razón de derivación: fallback_limit, manual_request, etc.';
COMMENT ON COLUMN advisor_requests.status IS 'Estado: pending (nuevo), contacted (agente contactó), resolved (cerrado), cancelled';

-- ============================================
-- 3. Agregar configuración de asesor en agent_config
-- ============================================
ALTER TABLE agent_config
ADD COLUMN business_hours VARCHAR(100) DEFAULT 'lunes a viernes 9:00 AM - 6:00 PM',
ADD COLUMN advisor_phone VARCHAR(20),
ADD COLUMN advisor_email VARCHAR(100);

COMMENT ON COLUMN agent_config.business_hours IS 'Horario de atención para mostrar al usuario';
COMMENT ON COLUMN agent_config.advisor_phone IS 'Teléfono del asesor para notificaciones por WhatsApp';
COMMENT ON COLUMN agent_config.advisor_email IS 'Email del asesor para notificaciones';

-- ============================================
-- 4. Actualizar configuración en agent_config
-- ============================================
-- Actualizar configuración del agente por defecto
UPDATE agent_config 
SET 
  business_hours = 'lunes a viernes 9:00 AM - 6:00 PM',
  advisor_phone = '+529933906926', -- Número de prueba (cambiar en producción)
  advisor_email = 'ventas@europa.com' -- Email de prueba (cambiar en producción)
WHERE id = (SELECT id FROM agent_config LIMIT 1);

