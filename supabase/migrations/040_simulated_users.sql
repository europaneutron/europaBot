-- Distingue los leads creados por el simulador para impedir que sus datos de
-- prueba se mezclen con la operacion. El valor por defecto conserva como reales
-- a todos los usuarios existentes y a los que llegan desde WhatsApp.

ALTER TABLE public.users
  ADD COLUMN is_simulated BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.is_simulated IS
  'Verdadero solo para leads desechables creados desde el simulador autenticado.';

CREATE INDEX idx_users_operational
  ON public.users(updated_at DESC)
  WHERE is_simulated = false;

-- users ya tiene RLS y politicas explicitas para authenticated y service_role.
-- Se reafirma RLS porque la marca pasa por la misma tabla expuesta al Data API.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users TO service_role;
