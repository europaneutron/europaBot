-- Separa la identidad del negocio del vocabulario con el que nombra su
-- catalogo. El saludo compuesto es opt-in para conservar literalmente el
-- contenido ya aprobado por clientes existentes.

ALTER TABLE public.client_brand_config
  ADD COLUMN business_name VARCHAR(120),
  ADD COLUMN use_composed_greeting BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT client_brand_business_name_not_blank
    CHECK (business_name IS NULL OR length(btrim(business_name)) > 0);

COMMENT ON COLUMN public.client_brand_config.business_name IS
  'Nombre de quien habla. Es distinto del nombre y del tipo de los proyectos que vende.';
COMMENT ON COLUMN public.client_brand_config.use_composed_greeting IS
  'Activa el saludo dinamico. Permanece desactivado hasta confirmacion explicita para no reescribir saludos existentes.';
