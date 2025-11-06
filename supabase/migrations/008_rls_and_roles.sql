-- ============================================
-- MIGRACIÓN 008: RLS y Roles de Usuario
-- Fecha: 2025-11-05
-- Objetivo: Implementar seguridad y control de acceso
-- ============================================

-- ============================================
-- TABLA: admin_users
-- ============================================
CREATE TABLE admin_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255),
  role VARCHAR(20) DEFAULT 'agent',
  
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_admin_users_email ON admin_users(email);
CREATE INDEX idx_admin_users_role ON admin_users(role);

-- Constraint para roles permitidos
ALTER TABLE admin_users
ADD CONSTRAINT admin_users_role_check 
CHECK (role IN ('super_admin', 'admin', 'agent', 'viewer'));

COMMENT ON TABLE admin_users IS 'Usuarios del dashboard administrativo';
COMMENT ON COLUMN admin_users.role IS 'super_admin: acceso total, admin: gestión de usuarios, agent: ver conversaciones, viewer: solo lectura';

-- Trigger de updated_at
CREATE TRIGGER update_admin_users_updated_at 
BEFORE UPDATE ON admin_users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- HABILITAR RLS EN TODAS LAS TABLAS
-- ============================================

-- Tabla: users (usuarios del bot)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can view all bot users"
  ON users FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

CREATE POLICY "Service role can manage bot users"
  ON users FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Tabla: conversations
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can view all conversations"
  ON conversations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

CREATE POLICY "Service role can manage conversations"
  ON conversations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Tabla: appointments
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can view all appointments"
  ON appointments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

CREATE POLICY "Admins and agents can update appointments"
  ON appointments FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.role IN ('super_admin', 'admin', 'agent')
      AND admin_users.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.role IN ('super_admin', 'admin', 'agent')
      AND admin_users.is_active = true
    )
  );

CREATE POLICY "Service role can manage appointments"
  ON appointments FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Tabla: intent_configurations (editable desde dashboard)
ALTER TABLE intent_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can view intent configs"
  ON intent_configurations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

CREATE POLICY "Only super_admin can modify intent configs"
  ON intent_configurations FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.role = 'super_admin'
      AND admin_users.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.role = 'super_admin'
      AND admin_users.is_active = true
    )
  );

CREATE POLICY "Service role full access intent_configurations"
  ON intent_configurations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Tabla: bot_responses (editable desde dashboard)
ALTER TABLE bot_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can view bot responses"
  ON bot_responses FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

CREATE POLICY "Admins can modify bot responses"
  ON bot_responses FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.role IN ('super_admin', 'admin')
      AND admin_users.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.role IN ('super_admin', 'admin')
      AND admin_users.is_active = true
    )
  );

CREATE POLICY "Service role full access bot_responses"
  ON bot_responses FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Tabla: advisor_requests
ALTER TABLE advisor_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can view advisor requests"
  ON advisor_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

CREATE POLICY "Agents can update advisor requests"
  ON advisor_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.role IN ('super_admin', 'admin', 'agent')
      AND admin_users.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.role IN ('super_admin', 'admin', 'agent')
      AND admin_users.is_active = true
    )
  );

CREATE POLICY "Service role can manage advisor requests"
  ON advisor_requests FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Tabla: user_sessions
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can view user sessions"
  ON user_sessions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

CREATE POLICY "Service role full access user_sessions"
  ON user_sessions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Tabla: user_progress
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can view user progress"
  ON user_progress FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

CREATE POLICY "Service role full access user_progress"
  ON user_progress FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Tabla: intents_log
ALTER TABLE intents_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can view intents log"
  ON intents_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

CREATE POLICY "Service role full access intents_log"
  ON intents_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Tabla: scheduled_followups
ALTER TABLE scheduled_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can view scheduled followups"
  ON scheduled_followups FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

CREATE POLICY "Service role full access followups"
  ON scheduled_followups FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Tabla: resources
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can view resources"
  ON resources FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

CREATE POLICY "Admins can manage resources"
  ON resources FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.role IN ('super_admin', 'admin')
      AND admin_users.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.role IN ('super_admin', 'admin')
      AND admin_users.is_active = true
    )
  );

CREATE POLICY "Service role full access resources"
  ON resources FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- NOTA: RLS de bot_config se define en migración 009
-- ============================================

-- ============================================
-- FUNCIONES DE AYUDA
-- ============================================

CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admin_users
    WHERE admin_users.id = auth.uid()
    AND admin_users.is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_admin_role()
RETURNS VARCHAR AS $$
BEGIN
  RETURN (
    SELECT role FROM admin_users
    WHERE admin_users.id = auth.uid()
    AND admin_users.is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- COMENTARIOS Y DOCUMENTACIÓN
-- ============================================

COMMENT ON TABLE admin_users IS 'Usuarios administrativos con roles y permisos';
COMMENT ON FUNCTION is_admin_user() IS 'Verifica si el usuario actual es un admin activo';
COMMENT ON FUNCTION get_admin_role() IS 'Obtiene el rol del admin actual (super_admin, admin, agent, viewer)';

-- ============================================
-- FINALIZACIÓN
-- ============================================
-- RLS implementado en todas las tablas
-- Service role mantiene acceso completo (necesario para webhook)
-- Usuarios autenticados acceden según su rol en admin_users
