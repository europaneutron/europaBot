-- Migración 021: Limpiar nombres de usuario corrompidos
--
-- Contexto: El flujo de derivación a asesor sobreescribía users.name con el texto
-- del mensaje del usuario (ej: "me llamo Pedro", "quiero info") en lugar de
-- preservar el nombre de perfil de WhatsApp.
--
-- Esta migración limpia registros donde users.name contiene texto de mensaje
-- (más de 40 caracteres o con ciertos patrones de mensaje) y los deja en NULL
-- para que sean corregidos automáticamente la próxima vez que el usuario
-- envíe un mensaje (el webhook sincroniza el nombre de perfil de WhatsApp).
--
-- Criterio de limpieza:
--   - Nombre mayor a 40 caracteres (ningún nombre real de WhatsApp llega a eso)
--   - Nombre que contiene frases de mensaje comunes (me llamo, hola, quiero, info, etc.)

UPDATE users
SET name = NULL
WHERE name IS NOT NULL
  AND (
    -- Nombres muy largos no son nombres reales de WhatsApp
    LENGTH(name) > 40
    -- Patrones claros de mensajes capturados por error (frases completas)
    OR name ILIKE '%me llamo%'
    OR name ILIKE '%mi nombre es%'
    OR name ILIKE '%quiero hablar%'
    OR name ILIKE '%quiero saber%'
    OR name ILIKE '%quiero reservar%'
    OR name ILIKE '%quisiera saber%'
    OR name ILIKE '%información sobre%'
    OR name ILIKE '%informacion sobre%'
    OR name ILIKE '%precio de%'
    OR name ILIKE '%obtener una casa%'
    OR name ILIKE 'hola'
  );
