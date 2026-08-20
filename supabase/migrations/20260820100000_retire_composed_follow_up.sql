-- ============================================
-- MIGRACIÓN: fuera la composición automática de botones de seguimiento
-- Fecha: 2026-08-20
-- Objetivo: que una respuesta sin botones propios se mande sola, sin que el
-- sistema le pegue sugerencias que nadie pidió.
--
-- El bot componia hasta dos preguntas vivas del alcance mas un boton fijo
-- de "Agendar visita" al final de CUALQUIER respuesta que no declarara sus
-- propios botones. Con el editor de bloques ya el unico camino para
-- escribir una respuesta, y los botones ya editables ahi mismo, esa red
-- dejo de ser una ayuda y paso a ser justo lo contrario de lo que se pidio:
-- botones que el administrador no puso y no puede quitar sin escribir el
-- suyo propio.
--
-- `offer_appointment_label` era el rotulo de ese boton compuesto -- su
-- unico consumidor era la composicion automatica. Sin ella, nadie lo lee:
-- se retira de la pantalla igual que los mensajes de la migracion anterior,
-- no se borra.
-- ============================================

UPDATE public.bot_config
SET category = 'retired_messages',
    is_editable = false
WHERE config_key = 'offer_appointment_label';
