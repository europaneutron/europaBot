-- =====================================================
-- Migration 004: Sistema de Citas
-- Fecha: 22 de octubre de 2025
-- Descripción: Tablas y configuración para agendamiento
-- =====================================================

-- 0. Modificar tabla appointments existente para agregar columnas necesarias
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS visitor_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS requested_date DATE,
ADD COLUMN IF NOT EXISTS agent_notified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS assigned_agent_id UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Actualizar constraint de time_slot si no existe
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'appointments_time_slot_check'
  ) THEN
    ALTER TABLE appointments 
    ADD CONSTRAINT appointments_time_slot_check 
    CHECK (time_slot IN ('morning', 'afternoon', 'evening'));
  END IF;
END $$;

-- Actualizar constraint de status si es necesario
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'appointments_status_check'
  ) THEN
    ALTER TABLE appointments 
    DROP CONSTRAINT IF EXISTS appointments_status_check;
    ALTER TABLE appointments 
    ADD CONSTRAINT appointments_status_check 
    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed'));
  END IF;
END $$;

-- Comentar columnas nuevas
COMMENT ON COLUMN appointments.visitor_name IS 'Nombre completo del visitante para la cita';
COMMENT ON COLUMN appointments.requested_date IS 'Fecha solicitada por el usuario (puede diferir de appointment_date)';
COMMENT ON COLUMN appointments.agent_notified_at IS 'Timestamp cuando se notificó al agente';

-- 1. Tabla de configuración de horarios
CREATE TABLE IF NOT EXISTS appointment_config (
  id SERIAL PRIMARY KEY,
  
  -- Horarios configurables
  time_slot VARCHAR(20) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  emoji VARCHAR(10),
  is_active BOOLEAN DEFAULT true,
  
  -- Orden de visualización
  display_order INTEGER,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabla de configuración de agentes
CREATE TABLE IF NOT EXISTS agent_config (
  id SERIAL PRIMARY KEY,
  
  -- Agente por defecto
  default_agent_phone VARCHAR(20) NOT NULL,
  default_agent_name VARCHAR(255) NOT NULL,
  
  -- Notificaciones
  notification_template TEXT,
  
  -- Metadata
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Modificar tabla user_progress para estados de flujo
ALTER TABLE user_progress 
ADD COLUMN IF NOT EXISTS appointment_flow_state VARCHAR(50),
ADD COLUMN IF NOT EXISTS appointment_flow_data JSONB;

-- Comentarios para documentación
COMMENT ON COLUMN user_progress.appointment_flow_state IS 'Estado actual del flujo de cita: ask_confirmation, ask_date, ask_time, ask_name, completed';
COMMENT ON COLUMN user_progress.appointment_flow_data IS 'Datos temporales del flujo: {requested_date, time_slot}';

-- 4. Insertar horarios por defecto
INSERT INTO appointment_config (time_slot, display_name, start_time, end_time, emoji, display_order) VALUES
  ('morning', 'Mañana', '09:00', '11:00', '🌅', 1),
  ('afternoon', 'Mediodía', '12:00', '15:00', '☀️', 2),
  ('evening', 'Tarde', '16:00', '19:00', '🌆', 3)
ON CONFLICT (time_slot) DO NOTHING;

-- 5. Insertar agente por defecto (CAMBIAR SEGÚN TU CASO)
INSERT INTO agent_config (default_agent_phone, default_agent_name, notification_template, is_active) VALUES
  (
    '+525512345678', 
    'Agente Europa',
    E'Hola {agent_name} 👋\n\n*{visitor_name}* está interesado en una visita al fraccionamiento.\n\n📅 Fecha solicitada: {date}\n🕐 Horario: {time_slot}\n\nPuedes comunicarte con él al: {whatsapp_link}\n\n¡Que tengas un excelente día!',
    true
  )
ON CONFLICT DO NOTHING;

-- 6. Intent para solicitar cita manualmente
INSERT INTO intent_configurations (
  intent_name,
  display_name,
  keywords,
  synonyms,
  typos,
  phrases,
  min_confidence,
  is_active,
  is_checkpoint
) VALUES (
  'cita',
  'Agendar Cita',
  ARRAY['cita', 'visita', 'agendar', 'agenda', 'ver', 'conocer'],
  ARRAY['agendar visita', 'programar cita', 'reservar', 'tour', 'visitar'],
  ARRAY['sita', 'bisita', 'ajendar', 'ajenda'],
  ARRAY['quiero agendar', 'me gustaría visitar', 'puedo ir a ver', 'cuando puedo ir'],
  0.70,
  true,
  false
)
ON CONFLICT (intent_name) DO NOTHING;

-- 7. Respuesta inicial para intent cita
INSERT INTO bot_responses (intent_name, response_key, message_text, response_type, order_priority, is_active)
VALUES (
  'cita',
  'main',
  '"📅 ¿Te gustaría agendar una visita al fraccionamiento Europa?"'::jsonb,
  'simple',
  1,
  true
)
ON CONFLICT DO NOTHING;

-- 8. Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_user_progress_appointment_flow ON user_progress(appointment_flow_state) 
  WHERE appointment_flow_state IS NOT NULL;

-- =====================================================
-- Verificación
-- =====================================================

-- Ver configuración de horarios
-- SELECT * FROM appointment_config ORDER BY display_order;

-- Ver configuración de agente
-- SELECT * FROM agent_config WHERE is_active = true;

-- Ver intent de cita
-- SELECT * FROM intent_configurations WHERE intent_name = 'cita';
