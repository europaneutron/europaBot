-- Restablece los modelos del compilador.
--
-- La 034 los bajo a gpt-4o-mini porque no habia forma de comprobar si gpt-5.4
-- existia: ninguna prueba llama a la API y el entorno local no tenia clave. Con
-- la clave configurada, el catalogo real confirma que gpt-5.4 y gpt-5.4-mini
-- existen, asi que la eleccion original era buena y la rebaja fue el error.
--
-- Lo que si faltaba era poder comprobarlo. Eso lo resuelve
-- scripts/list-ai-models.ts, y la validacion al guardar desde el dashboard
-- impide que un nombre inexistente llegue a produccion.
--
-- Solo restaura si el valor sigue siendo el que puso la 034: una eleccion
-- posterior de un administrador manda sobre esta.
UPDATE public.bot_config
SET config_value = 'gpt-5.4',
    updated_at = NOW()
WHERE config_key = 'ai_extraction_model'
  AND config_value = 'gpt-4o-mini';

UPDATE public.bot_config
SET config_value = 'gpt-5.4-mini',
    updated_at = NOW()
WHERE config_key = 'ai_writing_model'
  AND config_value = 'gpt-4o-mini';
