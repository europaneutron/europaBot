-- ============================================
-- MIGRACIÓN: saltos de línea de verdad, y la hora sin ceros de segundo
-- Fecha: 2026-08-20
-- Objetivo: tres mensajes de cita traían "\n" como dos caracteres literales
-- --barra invertida y ene-- en vez de un salto de línea real. La migración
-- 011 los escribió con comillas simples de SQL ('...'), que no interpretan
-- escapes; hacía falta E'...' para que Postgres los convirtiera en un salto
-- de línea de verdad. El resultado en WhatsApp: el mensaje de confirmación
-- de cita salía todo pegado, con "\n\n" visible como texto en medio.
--
-- De paso, el cierre cambia de una pregunta ("¿Necesitas algo más?") a una
-- afirmación, y `getTimeSlotDisplay` (en el código, no en esta migración)
-- deja de mostrar los segundos que Postgres siempre agrega a una columna
-- `time` ("09:00:00") y cierra con "hrs".
--
-- Aditiva y con guarda: cada UPDATE compara contra el valor exacto que dejó
-- la migración 011, así que si alguien ya reescribió alguno de estos tres
-- mensajes a su manera, ese texto se respeta.
-- ============================================

UPDATE public.bot_config
SET config_value = E'¡Perfecto! Tu cita está agendada para el {fecha} a las {hora}. 📅\n\nTe esperamos en:\n📍 {direccion}\n\n¡Nos vemos pronto! 😊'
WHERE config_key = 'appointment_confirmation'
  AND config_value = '¡Perfecto! Tu cita está agendada para el {fecha} a las {hora}. 📅\n\nTe esperamos en:\n📍 {direccion}\n\n¿Necesitas algo más?';

UPDATE public.bot_config
SET config_value = E'Esa hora no está disponible. Por favor elige uno de estos horarios:\n9:00 AM, 11:00 AM, 1:00 PM, 3:00 PM o 5:00 PM'
WHERE config_key = 'appointment_invalid_time'
  AND config_value = 'Esa hora no está disponible. Por favor elige uno de estos horarios:\n9:00 AM, 11:00 AM, 1:00 PM, 3:00 PM o 5:00 PM';

UPDATE public.bot_config
SET config_value = E'¿A qué hora prefieres tu cita? Horarios disponibles:\n\n9:00 AM\n11:00 AM\n1:00 PM\n3:00 PM\n5:00 PM\n\nPor favor elige una de estas opciones.'
WHERE config_key = 'appointment_request_time'
  AND config_value = '¿A qué hora prefieres tu cita? Horarios disponibles:\n\n9:00 AM\n11:00 AM\n1:00 PM\n3:00 PM\n5:00 PM\n\nPor favor elige una de estas opciones.';
