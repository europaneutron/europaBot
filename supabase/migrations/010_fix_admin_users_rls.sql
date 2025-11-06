-- ============================================
-- MIGRACIÓN 011: Habilitar RLS en admin_users
-- Fecha: 2025-11-05
-- Objetivo: Permitir que usuarios lean su propio perfil
-- ============================================

-- Habilitar RLS en admin_users (faltó en migración 008)
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas existentes si existen
DROP POLICY IF EXISTS "Users can read own admin profile" ON admin_users;
DROP POLICY IF EXISTS "Service role full access admin_users" ON admin_users;

-- Política: Usuarios pueden leer su propio perfil
CREATE POLICY "Users can read own admin profile"
  ON admin_users FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Política: Service role tiene acceso total
CREATE POLICY "Service role full access admin_users"
  ON admin_users FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Comentarios
COMMENT ON TABLE admin_users IS 'Usuarios administrativos - RLS habilitado para seguridad';
COMMENT ON POLICY "Users can read own admin profile" ON admin_users IS 'Permite que usuarios autenticados lean su propio perfil de admin';
