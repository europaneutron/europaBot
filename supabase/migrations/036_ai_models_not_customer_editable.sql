-- Los modelos dejan de ofrecerse en Ajustes.
--
-- Elegir entre dos modelos es una decision de ingenieria, no del cliente:
-- quien administra un bot inmobiliario no tiene con que compararlos, y un
-- campo de texto libre solo abre la puerta a un nombre mal escrito que no
-- falla al guardarse sino mucho despues, dentro de una compilacion, con el 404
-- enterrado en last_error.
--
-- Se quedan en bot_config y no en constantes del codigo a proposito: si un
-- modelo se retira de un dia para otro, se cambia una fila en vez de publicar
-- una version. Pero el dashboard ya no los muestra.
UPDATE public.bot_config
SET is_editable = false,
    description = CASE config_key
      WHEN 'ai_model' THEN 'Modelo para generar patrones del matcher. Lo elige el equipo del producto; no se expone al cliente.'
      WHEN 'ai_extraction_model' THEN 'Modelo que lee documentos y fija hechos. Lo elige el equipo del producto tras medir contra material real.'
      WHEN 'ai_writing_model' THEN 'Modelo que redacta propuestas a partir de hechos ya extraidos. Lo elige el equipo del producto.'
      ELSE description
    END,
    updated_at = NOW()
WHERE config_key IN ('ai_model', 'ai_extraction_model', 'ai_writing_model');
