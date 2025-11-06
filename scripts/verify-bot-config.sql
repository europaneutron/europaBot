-- Script SQL para verificar bot_config directamente en Supabase Studio
-- Ejecutar en: https://supabase.com/dashboard/project/[tu-proyecto]/sql

-- Verificar que la tabla existe
SELECT 
  COUNT(*) as total_configs,
  COUNT(CASE WHEN is_editable = true THEN 1 END) as editables,
  COUNT(CASE WHEN is_editable = false THEN 1 END) as bloqueadas
FROM bot_config;

-- Ver todas las configuraciones agrupadas por categoría
SELECT 
  category,
  config_key,
  config_value,
  config_type,
  is_editable,
  description
FROM bot_config
ORDER BY category, config_key;

-- Verificar configuraciones clave para el sistema de citas
SELECT 
  config_key,
  config_value,
  description
FROM bot_config
WHERE config_key IN (
  'checkpoints_for_appointment',
  'max_checkpoints',
  'appointment_auto_offer_enabled',
  'checkpoint_points'
)
ORDER BY config_key;
