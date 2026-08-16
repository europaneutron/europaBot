-- El vocabulario del cliente se marca, no se adivina.
--
-- La sustitucion por busqueda de palabras reescribia lo que no debia. Con la
-- palabra "plaza" elegida por un cliente:
--
--   "Calle Principal #123, Fraccionamiento Europa"  ->  "... Plaza Europa"
--   "nuestras casas en Fraccionamiento Europa"      ->  "... en Plaza Europa"
--
-- Las dos son el nombre propio del desarrollo del cliente, y la primera es la
-- direccion que el bot le manda a un lead que va a ir fisicamente. Ninguna
-- heuristica sobre lenguaje natural distingue un sustantivo comun de un nombre
-- propio, asi que quien escribe el mensaje marca donde va la palabra.
--
-- Solo se tocan los mensajes que siguen con su texto sembrado: una edicion
-- posterior del administrador manda sobre esto.
--
-- Regla al escribir un mensaje con la palabra del cliente: el marcador no
-- lleva articulo delante. La palabra la elige el cliente y su genero no se
-- conoce -"el desarrollo" pero "la plaza"-, asi que un articulo fijo produce
-- "los plazas" y "el plaza". Se redacta esquivando el articulo en lugar de
-- pedirle al cliente un dato gramatical que no deberia tener que darnos.

UPDATE public.bot_config
SET config_value = '¿De cuál {project_singular} te gustaría recibir información?' || chr(10) || chr(10) || '{alcances}',
    description = 'Pregunta para precisar el alcance. Variables disponibles: {alcances}, {project_singular}, {project_plural}',
    updated_at = NOW()
WHERE config_key = 'scope_disambiguation_message'
  AND config_value LIKE '%¿De cuál desarrollo te gustaría recibir información?%';

UPDATE public.bot_config
SET config_value = '{project_plural_title} disponibles:' || chr(10) || chr(10) || '{alcances}' || chr(10) || chr(10) || '¿Cuál te interesa?',
    description = 'Presentación de alcances en el saludo. Variables disponibles: {alcances}, {project_singular}, {project_plural}',
    updated_at = NOW()
WHERE config_key = 'scope_presentation_message'
  AND config_value LIKE '%Estos son los desarrollos disponibles:%';

UPDATE public.bot_config
SET config_value = '¡Veo que estás muy interesado! 🎉 ¿Te gustaría agendar una visita en persona?',
    updated_at = NOW()
WHERE config_key = 'auto_offer_message'
  AND config_value = '¡Veo que estás muy interesado! 🎉 ¿Te gustaría agendar una visita para conocer el fraccionamiento en persona?';
