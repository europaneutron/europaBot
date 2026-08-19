-- ============================================
-- MIGRACIÓN: bot_config se acota por alcance
-- Fecha: 2026-08-19
-- Objetivo: primer paso de la unificación descrita en AGENTS.md sección 6.
-- bot_config gana scope_id; las filas existentes quedan como globales
-- (scope_id NULL). El código empieza a leer por alcance con la misma
-- herencia que el resto del contenido. Las tres columnas duplicadas de
-- agent_config (advisor_phone, business_hours, advisor_email) se retiran en
-- una migración posterior, cuando ninguna ruta las lea ya.
-- ============================================

ALTER TABLE public.bot_config
  ADD COLUMN scope_id UUID REFERENCES public.scopes(id) ON DELETE CASCADE;

-- Antes: config_key era única por sí sola, una fila global por clave. Ahora
-- una clave puede tener una fila global (scope_id NULL) y además una por
-- cada alcance que la sobrescriba. Dos índices parciales en vez de un
-- UNIQUE NULLS NOT DISTINCT: así el `ON CONFLICT (config_key)` que ya usan
-- las migraciones que siembran configuración global sigue siendo inferible
-- (solo necesita añadir `WHERE scope_id IS NULL`, que es exactamente lo que
-- esas siembras insertan).
ALTER TABLE public.bot_config DROP CONSTRAINT bot_config_config_key_key;

CREATE UNIQUE INDEX bot_config_key_global_unique
  ON public.bot_config(config_key) WHERE scope_id IS NULL;
-- Sin WHERE: un índice único de dos columnas no compara NULLs entre sí, así
-- que esto no limita las filas globales -- ya las cubre el índice de
-- arriba-- y sí exige que `ON CONFLICT (config_key, scope_id)` (el upsert
-- por alcance) pueda inferirse sin predicado.
CREATE UNIQUE INDEX bot_config_key_scope_unique
  ON public.bot_config(config_key, scope_id);

CREATE INDEX idx_bot_config_scope ON public.bot_config(scope_id);

COMMENT ON COLUMN public.bot_config.scope_id IS
  'Alcance que sobrescribe este valor. NULL es global: la fila sembrada por la migración 009.';
