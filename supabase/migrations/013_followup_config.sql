-- Migración 013: Configuración del Sistema de Follow-up
-- Agrega columna faltante a scheduled_followups y configuraciones a bot_config

-- ============================================
-- 1. Agregar columna advisor_request_id a scheduled_followups
-- ============================================
ALTER TABLE scheduled_followups
ADD COLUMN IF NOT EXISTS advisor_request_id UUID REFERENCES advisor_requests(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_followups_advisor_request ON scheduled_followups(advisor_request_id);

COMMENT ON COLUMN scheduled_followups.advisor_request_id IS 
'Referencia a la solicitud de asesor que generó este follow-up (para evitar duplicados)';

-- ============================================
-- 2. Agregar configuraciones de follow-up a bot_config
-- ============================================
INSERT INTO bot_config (config_key, config_value, config_type, description, category, is_editable) VALUES

-- Activación del sistema
('followup_enabled', 'true', 'boolean', 
 'Activar sistema de follow-up automático para conversaciones abandonadas', 
 'followup', true),

-- Ventana horaria de envío
('followup_window_start', '09:00', 'string', 
 'Hora inicio ventana de envío (formato HH:mm) - ventana gratuita WhatsApp', 
 'followup', true),

('followup_window_end', '18:00', 'string', 
 'Hora fin ventana de envío (formato HH:mm) - ventana gratuita WhatsApp', 
 'followup', true),

-- Plantilla del mensaje (soporta variables {nombre}, {telefono})
('followup_template', 
 'Hola {nombre}! 👋

Noté que tenías interés en conocer más sobre nuestras casas en Fraccionamiento Europa.

¿Aún tienes alguna duda? Puedo ayudarte con:
• Información sobre precios y planes de pago
• Agendar una visita para ver las casas muestra
• Resolver cualquier pregunta que tengas

¿Te gustaría que platiquemos? 😊', 
 'string', 
 'Plantilla del mensaje de follow-up. Variables disponibles: {nombre}, {telefono}', 
 'followup', true)

ON CONFLICT (config_key) DO NOTHING;

-- ============================================
-- 3. Comentarios de documentación
-- ============================================
COMMENT ON TABLE scheduled_followups IS 
'Mensajes programados de follow-up para reactivar conversaciones abandonadas. 
Algoritmo: programa en ventana 9am-6pm del día siguiente respetando 24h cuando sea posible.';

COMMENT ON COLUMN scheduled_followups.followup_type IS 
'Tipo de follow-up: advisor_request (después de solicitar asesor sin agendar cita)';

COMMENT ON COLUMN scheduled_followups.message_variables IS 
'Variables JSON para interpolar en la plantilla, ej: {"nombre": "Juan", "telefono": "+521234567890"}';

COMMENT ON COLUMN scheduled_followups.executed_at IS 
'Timestamp de cuándo se ejecutó el envío del mensaje (equivalente a sent_at)';

COMMENT ON COLUMN scheduled_followups.user_responded IS 
'Indica si el usuario respondió después del follow-up (para métricas)';
