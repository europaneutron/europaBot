-- ============================================
-- MIGRACIÓN 019: Typing Indicator Configuration
-- Fecha: 2025-11-20
-- Objetivo: Agregar configuración para indicador de "escribiendo" en WhatsApp
-- ============================================

INSERT INTO bot_config (config_key, config_value, config_type, description, category, is_editable) 
VALUES (
  'typing_indicator_enabled',
  'true',
  'boolean',
  'Mostrar indicador de "escribiendo..." en WhatsApp antes de responder',
  'messages',
  true
)
ON CONFLICT (config_key) DO NOTHING;
