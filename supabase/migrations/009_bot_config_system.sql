-- ============================================
-- MIGRACIÓN 009: Sistema de Configuración Dinámica
-- Fecha: 2025-11-05
-- Objetivo: Hacer el bot 100% configurable sin tocar código
-- ============================================

-- ============================================
-- TABLA: bot_config
-- ============================================
CREATE TABLE bot_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key VARCHAR(100) UNIQUE NOT NULL,
  config_value TEXT NOT NULL,
  config_type VARCHAR(20) DEFAULT 'string',
  description TEXT,
  category VARCHAR(50) DEFAULT 'general',
  is_editable BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_bot_config_key ON bot_config(config_key);
CREATE INDEX idx_bot_config_category ON bot_config(category);

-- Constraint para tipos permitidos
ALTER TABLE bot_config
ADD CONSTRAINT bot_config_type_check 
CHECK (config_type IN ('string', 'integer', 'boolean', 'json'));

COMMENT ON TABLE bot_config IS 'Configuración dinámica del bot - editable desde dashboard';
COMMENT ON COLUMN bot_config.config_type IS 'string, integer, boolean o json';
COMMENT ON COLUMN bot_config.is_editable IS 'false para configs críticas que no deben cambiarse desde UI';

-- Trigger de updated_at
CREATE TRIGGER update_bot_config_updated_at 
BEFORE UPDATE ON bot_config
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- CONFIGURACIONES INICIALES
-- ============================================

INSERT INTO bot_config (config_key, config_value, config_type, description, category, is_editable) VALUES

-- Categoría: Checkpoints y Citas
('checkpoints_for_appointment', '4', 'integer', 'Número de checkpoints requeridos antes de ofrecer cita automáticamente (1 hasta max_checkpoints)', 'appointments', true),
('max_checkpoints', '6', 'integer', 'Número máximo de checkpoints disponibles actualmente (informativo)', 'appointments', false),
('appointment_auto_offer_enabled', 'true', 'boolean', 'Activar/desactivar oferta automática de citas', 'appointments', true),

-- Categoría: Lead Scoring
('checkpoint_points', '15', 'integer', 'Puntos base por cada checkpoint completado', 'scoring', true),
('appointment_points', '20', 'integer', 'Puntos adicionales por agendar cita', 'scoring', true),
('auto_offer_response_points', '10', 'integer', 'Puntos por responder positivamente al auto-offer de cita', 'scoring', true),
('lead_score_cold_max', '39', 'integer', 'Score máximo para clasificar lead como COLD (0-39)', 'scoring', true),
('lead_score_warm_max', '69', 'integer', 'Score máximo para clasificar lead como WARM (40-69, 70+ es HOT)', 'scoring', true),

-- Categoría: Fallback y Derivación
('max_fallback_attempts', '3', 'integer', 'Intentos de fallback antes de derivar a asesor humano', 'fallback', true),
('fallback_derivation_enabled', 'true', 'boolean', 'Activar derivación a asesor después de alcanzar max fallbacks', 'fallback', true),

-- Categoría: Horarios y Contacto
('business_hours', 'lunes a viernes 9:00 AM - 6:00 PM', 'string', 'Horario de atención para mostrar a usuarios', 'contact', true),
('advisor_phone', '', 'string', 'Teléfono del asesor para notificaciones (formato: +52XXXXXXXXXX)', 'contact', true),
('advisor_email', '', 'string', 'Email del asesor para notificaciones y reportes', 'contact', true),

-- Categoría: Mensajes del Bot
('welcome_message_enabled', 'false', 'boolean', 'Enviar mensaje de bienvenida automático a nuevos usuarios', 'messages', true),
('welcome_message', 'Hola! Soy el asistente virtual de Fraccionamiento Europa. ¿En qué puedo ayudarte hoy?', 'string', 'Mensaje de bienvenida para nuevos usuarios (solo si está habilitado)', 'messages', true);

-- ============================================
-- RLS PARA bot_config
-- ============================================
-- NOTA: Estas políticas usan admin_users de la migración 008

ALTER TABLE bot_config ENABLE ROW LEVEL SECURITY;

-- Los admins pueden ver todas las configuraciones
CREATE POLICY "Admin users can view bot config"
  ON bot_config FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

-- Solo super_admin puede modificar configuraciones editables
CREATE POLICY "Super admin can modify editable configs"
  ON bot_config FOR UPDATE
  TO authenticated
  USING (
    is_editable = true AND
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.role = 'super_admin'
      AND admin_users.is_active = true
    )
  )
  WITH CHECK (
    is_editable = true AND
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.role = 'super_admin'
      AND admin_users.is_active = true
    )
  );

-- Service role tiene acceso total (para el webhook y procesos del bot)
CREATE POLICY "Service role full access bot_config"
  ON bot_config FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- COMENTARIOS Y DOCUMENTACIÓN
-- ============================================

COMMENT ON COLUMN bot_config.config_key IS 'Clave única de configuración (ej: checkpoints_for_appointment)';
COMMENT ON COLUMN bot_config.config_value IS 'Valor de la configuración (siempre texto, convertir según config_type)';
COMMENT ON COLUMN bot_config.category IS 'Categoría para agrupar en dashboard: appointments, scoring, fallback, contact, messages';

-- ============================================
-- VERIFICACIÓN
-- ============================================

-- Consulta para verificar que todo se insertó correctamente
-- SELECT category, config_key, config_value, config_type, is_editable 
-- FROM bot_config 
-- ORDER BY category, config_key;
