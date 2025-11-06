-- ============================================
-- MIGRACIÓN 010: Mensajes Personalizables del Bot
-- Fecha: 2025-11-06
-- Objetivo: Centralizar todos los mensajes del bot en bot_config
-- ============================================

INSERT INTO bot_config (config_key, config_value, config_type, description, category, is_editable) VALUES

-- ============================================
-- Categoría: Mensajes de Sistema y Error
-- ============================================
('error_technical', 'Lo siento, ocurrió un error técnico. Por favor intenta de nuevo en unos momentos.', 'string', 'Mensaje cuando hay error técnico del sistema', 'system_messages', true),
('error_processing', 'No pude procesar tu solicitud en este momento. ¿Podrías intentarlo de nuevo?', 'string', 'Mensaje cuando falla el procesamiento de un mensaje', 'system_messages', true),

-- ============================================
-- Categoría: Mensajes de Fallback
-- ============================================
('fallback_level_1', 'No estoy seguro de entender tu pregunta. ¿Podrías reformularla de otra manera?', 'string', 'Primer intento de fallback', 'fallback_messages', true),
('fallback_level_2', 'Disculpa, aún no logro comprender. ¿Podrías ser más específico sobre lo que necesitas?', 'string', 'Segundo intento de fallback', 'fallback_messages', true),
('fallback_level_3', 'Veo que necesitas ayuda más específica. Permíteme derivarte con un asesor humano que podrá atenderte mejor.', 'string', 'Tercer intento de fallback antes de derivar', 'fallback_messages', true),

-- ============================================
-- Categoría: Mensajes de Auto-Offer (Oferta de Cita)
-- ============================================
('auto_offer_message', '¡Veo que estás muy interesado! 🎉 ¿Te gustaría agendar una visita para conocer el fraccionamiento en persona?', 'string', 'Mensaje cuando se completan los checkpoints requeridos', 'appointment_messages', true),
('auto_offer_yes_response', '¡Perfecto! Vamos a agendar tu visita. 📅', 'string', 'Respuesta cuando el usuario acepta la oferta de cita', 'appointment_messages', true),
('auto_offer_no_response', 'Entendido, cuando estés listo para agendar una visita solo dímelo. ¿Hay algo más en lo que pueda ayudarte?', 'string', 'Respuesta cuando el usuario rechaza la oferta de cita', 'appointment_messages', true),

-- ============================================
-- Categoría: Mensajes de Flujo de Citas
-- ============================================
('appointment_request_date', '¿Qué día te gustaría visitarnos? Por favor indica una fecha (ejemplo: mañana, viernes, 15 de noviembre)', 'string', 'Solicitar fecha de la cita', 'appointment_messages', true),
('appointment_invalid_date', 'Lo siento, esa fecha no es válida o ya pasó. Por favor indica una fecha futura (ejemplo: mañana, lunes, 20 de noviembre)', 'string', 'Fecha no válida o pasada', 'appointment_messages', true),
('appointment_weekend_date', 'Los fines de semana no tenemos servicio. ¿Podrías elegir un día entre lunes y viernes?', 'string', 'Usuario eligió sábado o domingo', 'appointment_messages', true),

('appointment_request_time', '¿A qué hora prefieres tu cita? Horarios disponibles:\n\n9:00 AM\n11:00 AM\n1:00 PM\n3:00 PM\n5:00 PM\n\nPor favor elige una de estas opciones.', 'string', 'Solicitar hora de la cita con opciones', 'appointment_messages', true),
('appointment_invalid_time', 'Esa hora no está disponible. Por favor elige uno de estos horarios:\n9:00 AM, 11:00 AM, 1:00 PM, 3:00 PM o 5:00 PM', 'string', 'Hora no válida o no disponible', 'appointment_messages', true),

('appointment_confirmation', '¡Perfecto! Tu cita está agendada para el {fecha} a las {hora}. 📅\n\nTe esperamos en:\n📍 {direccion}\n\n¿Necesitas algo más?', 'string', 'Confirmación final de cita (variables: {fecha}, {hora}, {direccion})', 'appointment_messages', true),
('appointment_address', 'Calle Principal #123, Fraccionamiento Europa, Ciudad', 'string', 'Dirección del fraccionamiento para incluir en confirmación', 'appointment_messages', true),

-- ============================================
-- Categoría: Mensajes de Derivación a Asesor
-- ============================================
('derivation_intro', 'Entiendo que necesitas ayuda más específica. Permíteme conectarte con un asesor humano que podrá atenderte mejor. 👤', 'string', 'Introducción antes de derivar a asesor', 'derivation_messages', true),
('derivation_request_name', 'Antes de conectarte con un asesor, ¿podrías compartirme tu nombre completo?', 'string', 'Solicitar nombre del usuario', 'derivation_messages', true),
('derivation_name_confirmed', 'Gracias {nombre}! Un asesor se pondrá en contacto contigo pronto. En el horario de {horario}.', 'string', 'Confirmación de derivación (variables: {nombre}, {horario})', 'derivation_messages', true),
('derivation_pending', 'Tu solicitud ha sido registrada. Un asesor te contactará pronto. 📞', 'string', 'Mensaje cuando se registra solicitud de asesor', 'derivation_messages', true);


-- ============================================
-- VERIFICACIÓN
-- ============================================

-- Consulta para ver los nuevos mensajes
-- SELECT category, config_key, LEFT(config_value, 50) as preview, is_editable 
-- FROM bot_config 
-- WHERE category IN ('system_messages', 'fallback_messages', 'appointment_messages', 'derivation_messages')
-- ORDER BY category, config_key;
