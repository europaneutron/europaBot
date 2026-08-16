-- Un hecho necesita saber de que habla, no solo que dice.
--
-- Sin sujeto, "tres modelos con tres precios" y "el mismo modelo con dos
-- precios distintos" son indistinguibles: los dos son la clave `price` con
-- varios valores. La consolidacion marcaba contradiccion en ambos, y como la
-- primera forma es la de cualquier catalogo, la senal se encendia en casi
-- todas las propuestas de precio. Una senal que siempre esta encendida no
-- ordena la revision, la anula.
--
-- Con sujeto, la contradiccion es lo que siempre debio ser: mismo hecho sobre
-- el mismo sujeto con dos valores distintos.

ALTER TABLE public.compiler_facts
  ADD COLUMN subject TEXT;

COMMENT ON COLUMN public.compiler_facts.subject IS
  'De que habla el hecho: un modelo, una etapa, una unidad. Nulo cuando el hecho es del desarrollo entero. Distingue un catalogo de una contradiccion.';

CREATE INDEX idx_compiler_facts_key_subject
  ON public.compiler_facts(run_id, fact_key, subject);

-- Los identificadores de modelo sembrados por la 033 no existen en la API.
-- Un nombre inventado no falla al guardarse: falla al compilar, con un 404
-- enterrado en last_error. Se dejan en el unico verificado del proyecto; el
-- definitivo se elige comprobando el catalogo real con scripts/list-ai-models.ts.
UPDATE public.bot_config
SET config_value = 'gpt-4o-mini',
    updated_at = NOW()
WHERE config_key IN ('ai_extraction_model', 'ai_writing_model')
  AND config_value IN ('gpt-5.4', 'gpt-5.4-mini');

-- La aprobacion es la unica compuerta entre el modelo y un lead, y publicarla
-- es una transaccion: crea la respuesta, sus dependencias y los patrones. Con
-- UPDATE abierto a authenticated, el estado se podia cambiar desde el navegador
-- sin pasar por la funcion, dejando una propuesta "aprobada" sin respuesta que
-- la sirva. Solo el backend, a traves de approve_compiler_proposal, la mueve.
REVOKE UPDATE, DELETE ON TABLE public.compiler_proposals FROM authenticated;
REVOKE INSERT ON TABLE public.compiler_proposals FROM authenticated;

DROP POLICY IF EXISTS "active_admin_all_compiler_proposals" ON public.compiler_proposals;

CREATE POLICY "active_admin_read_compiler_proposals"
  ON public.compiler_proposals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users a
      WHERE a.id = (SELECT auth.uid()) AND a.is_active
    )
  );
