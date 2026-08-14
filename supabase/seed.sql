-- Seed local — EuropaBot
--
-- Se ejecuta automaticamente despues de las migraciones en `supabase start`
-- y `supabase db reset`, segun [db.seed] en config.toml.
--
-- Este archivo NUNCA llega a produccion: `supabase db push` sube unicamente
-- las migraciones de supabase/migrations.

-- Privilegios de los roles de Supabase sobre las tablas del esquema public.
--
-- En una base local recien creada, las tablas de las migraciones pueden quedar
-- sin grants para anon, authenticated y service_role, lo que produce
-- "permission denied" en cualquier consulta, incluso desde el backend con la
-- clave de servicio. Es independiente de RLS: los grants controlan el acceso a
-- la tabla y las politicas controlan las filas visibles; sin grants, RLS ni
-- siquiera se evalua.
--
-- Produccion no necesita esto: sus grants ya existen.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
