-- ============================================
-- MIGRACIÓN: botones en los mensajes de fallback
-- Fecha: 2026-08-21
-- Objetivo: que los 3 niveles de fallback puedan colgar los mismos botones
-- que cualquier respuesta escrita a mano, en vez de mandarse siempre en
-- texto plano.
--
-- El mecanismo ya existe para las respuestas normales: la sesión guarda
-- `pending_offer_options` y un toque llega como identificador
-- `intent:<pregunta>:<alcance>`, resuelto sin pasar por el matcher (ver
-- `authoredButtonsToOfferOptions`). Lo que faltaba era un sitio donde
-- guardar los botones de un mensaje que no vive en `bot_responses`.
--
-- `bot_config` ya admite `config_type = 'json'`, así que no hace falta una
-- tabla nueva: solo una fila más por nivel, con la misma forma que
-- `bot_responses.buttons` ([{"label","intentName","scopeId","description"}]).
-- NULL/[] significa "sin botones", que es lo que hacen hoy los 3 niveles.
--
-- Aditiva: producción puede aplicarla sin ventana.
-- ============================================

INSERT INTO bot_config (config_key, config_value, config_type, description, category, is_editable) VALUES
('fallback_level_1_buttons', '[]', 'json', 'Botones del primer intento de fallback', 'fallback_messages', true),
('fallback_level_2_buttons', '[]', 'json', 'Botones del segundo intento de fallback', 'fallback_messages', true),
('fallback_level_3_buttons', '[]', 'json', 'Botones del mensaje de derivación a asesor (nivel 3 y botón "Hablar con un asesor")', 'derivation_messages', true);
