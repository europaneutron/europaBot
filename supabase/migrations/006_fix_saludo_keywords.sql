-- Migración 006: Fix keywords del intent saludo
-- Eliminar 'que' y 'qué' de keywords porque son palabras interrogativas comunes

UPDATE intent_configurations
SET keywords = ARRAY['hola', 'buenas', 'buenos', 'saludos', 'hey']
WHERE intent_name = 'saludo';

-- Nota: 'que tal' y 'qué tal' permanecen en synonyms, que es correcto
