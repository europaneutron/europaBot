-- Migration 024: RLS for unprotected tables + profile change password support
-- Agrega RLS a 3 tablas que no tenian politicas de seguridad

-- agent_config
ALTER TABLE agent_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_agent_config" ON agent_config
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "admin_read_agent_config" ON agent_config
  FOR SELECT USING (
    auth.role() = 'authenticated' AND
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND is_active = true)
  );

-- appointment_config
ALTER TABLE appointment_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_appointment_config" ON appointment_config
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "admin_read_appointment_config" ON appointment_config
  FOR SELECT USING (
    auth.role() = 'authenticated' AND
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND is_active = true)
  );

-- bot_status
ALTER TABLE bot_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_bot_status" ON bot_status
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "admin_read_bot_status" ON bot_status
  FOR SELECT USING (
    auth.role() = 'authenticated' AND
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND is_active = true)
  );
