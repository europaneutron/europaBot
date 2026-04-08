-- Dynamic checkpoint tracking: 1 row per checkpoint completed
-- Replaces the fixed-column approach in user_progress
CREATE TABLE user_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  intent_name VARCHAR(50) NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, intent_name)
);

CREATE INDEX idx_user_checkpoints_user_id ON user_checkpoints(user_id);

-- Migrate existing data from user_progress columns into user_checkpoints
INSERT INTO user_checkpoints (user_id, intent_name, completed_at)
SELECT user_id, 'precio', COALESCE(precio_completed_at, NOW())
  FROM user_progress WHERE precio_completed = true
UNION ALL
SELECT user_id, 'ubicacion', COALESCE(ubicacion_completed_at, NOW())
  FROM user_progress WHERE ubicacion_completed = true
UNION ALL
SELECT user_id, 'modelo', COALESCE(modelo_completed_at, NOW())
  FROM user_progress WHERE modelo_completed = true
UNION ALL
SELECT user_id, 'creditos', COALESCE(creditos_completed_at, NOW())
  FROM user_progress WHERE creditos_completed = true
UNION ALL
SELECT user_id, 'seguridad', COALESCE(seguridad_completed_at, NOW())
  FROM user_progress WHERE seguridad_completed = true
UNION ALL
SELECT user_id, 'brochure', COALESCE(brochure_completed_at, NOW())
  FROM user_progress WHERE brochure_completed = true
ON CONFLICT (user_id, intent_name) DO NOTHING;

-- Enable RLS
ALTER TABLE user_checkpoints ENABLE ROW LEVEL SECURITY;

-- Service role can manage all rows (backend/webhook)
CREATE POLICY "Service role full access user_checkpoints"
  ON user_checkpoints
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Admin users can view checkpoints (dashboard)
CREATE POLICY "Admin users can view user checkpoints"
  ON user_checkpoints
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );
