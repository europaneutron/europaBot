-- El agregado que ve el dashboard vuelve a ser el máximo entre TODAS las filas
-- de progreso de la persona.
--
-- La 031 lo acotó a las ramas activas de primer nivel, y eso borraba historial
-- en dos situaciones reales:
--
--   1. Todo el progreso anterior a los alcances vive en la raíz. El día que un
--      cliente da de alta su segundo desarrollo, la raíz deja de ser rama y
--      cada lead histórico cae a 0 en cuanto vuelve a escribir. El detalle
--      seguía diciendo 60; el dashboard decía 0.
--   2. Al desactivar un desarrollo agotado, sus leads calificados se apagaban
--      con él. Son justamente las personas a las que el equipo quiere llamar
--      para ofrecerles el siguiente.
--
-- Un lead calificado no deja de estarlo porque cambie el catálogo. El filtro
-- se retira; la protección contra sumar entre ramas no vive aquí sino en cómo
-- se puntúa cada alcance, que la aplicación acota a su propio subárbol y, en
-- el caso de la raíz, únicamente a ella misma.

CREATE OR REPLACE FUNCTION public.save_scope_lead_score(
  p_user_id UUID,
  p_scope_id UUID,
  p_lead_score INTEGER,
  p_lead_status VARCHAR
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  aggregate_score INTEGER;
  aggregate_status VARCHAR(20);
BEGIN
  INSERT INTO public.user_scope_progress (
    user_id,
    scope_id,
    lead_score,
    lead_status
  ) VALUES (
    p_user_id,
    p_scope_id,
    p_lead_score,
    p_lead_status
  )
  ON CONFLICT (user_id, scope_id) DO UPDATE SET
    lead_score = EXCLUDED.lead_score,
    lead_status = EXCLUDED.lead_status,
    updated_at = NOW();

  SELECT progress.lead_score, progress.lead_status
  INTO aggregate_score, aggregate_status
  FROM public.user_scope_progress AS progress
  WHERE progress.user_id = p_user_id
  ORDER BY progress.lead_score DESC, progress.updated_at DESC, progress.id ASC
  LIMIT 1;

  UPDATE public.users
  SET lead_score = COALESCE(aggregate_score, 0),
      lead_status = COALESCE(aggregate_status, 'cold'),
      updated_at = NOW()
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_scope_lead_score(UUID, UUID, INTEGER, VARCHAR)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_scope_lead_score(UUID, UUID, INTEGER, VARCHAR)
  TO service_role;

-- Reparar a quien ya haya quedado por debajo de su detalle. Solo sube: nunca
-- rebaja una cifra existente, porque no hay forma de saber si viene de aquí.
UPDATE public.users
SET lead_score = best.lead_score,
    lead_status = best.lead_status,
    updated_at = NOW()
FROM (
  SELECT DISTINCT ON (progress.user_id)
    progress.user_id,
    progress.lead_score,
    progress.lead_status
  FROM public.user_scope_progress AS progress
  ORDER BY progress.user_id, progress.lead_score DESC, progress.updated_at DESC, progress.id ASC
) AS best
WHERE users.id = best.user_id
  AND users.lead_score < best.lead_score;
