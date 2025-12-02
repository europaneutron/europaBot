/**
 * Migración 020: Sistema de Rate Limiting para Login
 * 
 * Previene ataques de fuerza bruta limitando intentos de login
 * - Máximo 5 intentos por email cada 15 minutos
 * - Bloqueo temporal automático
 * - Limpieza automática de registros antiguos
 */

-- Tabla para rastrear intentos de login
CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier VARCHAR(255) NOT NULL,  -- Email del usuario
  attempt_count INTEGER DEFAULT 1,
  locked_until TIMESTAMPTZ NULL,      -- NULL = no bloqueado
  last_attempt TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT login_attempts_identifier_unique UNIQUE (identifier)
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_login_attempts_identifier ON login_attempts(identifier);
CREATE INDEX IF NOT EXISTS idx_login_attempts_locked ON login_attempts(locked_until) 
  WHERE locked_until IS NOT NULL;

-- Comentarios
COMMENT ON TABLE login_attempts IS 'Rastrea intentos de login para rate limiting (5 intentos / 15 min)';
COMMENT ON COLUMN login_attempts.identifier IS 'Email del usuario que intenta login';
COMMENT ON COLUMN login_attempts.attempt_count IS 'Número de intentos fallidos consecutivos';
COMMENT ON COLUMN login_attempts.locked_until IS 'Fecha/hora hasta cuando está bloqueado (NULL si no)';

-- Función para verificar y registrar intento de login
CREATE OR REPLACE FUNCTION check_login_attempt(p_email VARCHAR)
RETURNS TABLE (
  is_allowed BOOLEAN,
  attempts_remaining INTEGER,
  locked_until_ts TIMESTAMPTZ,
  seconds_until_unlock INTEGER
) AS $$
DECLARE
  v_record login_attempts%ROWTYPE;
  v_max_attempts INTEGER := 5;
  v_lockout_minutes INTEGER := 15;
BEGIN
  -- Buscar registro existente
  SELECT * INTO v_record 
  FROM login_attempts 
  WHERE identifier = LOWER(p_email);
  
  -- Si no existe, permitir
  IF NOT FOUND THEN
    RETURN QUERY SELECT 
      TRUE::BOOLEAN,
      v_max_attempts::INTEGER,
      NULL::TIMESTAMPTZ,
      0::INTEGER;
    RETURN;
  END IF;
  
  -- Si está bloqueado, verificar si ya expiró
  IF v_record.locked_until IS NOT NULL THEN
    IF v_record.locked_until > NOW() THEN
      -- Aún bloqueado
      RETURN QUERY SELECT 
        FALSE::BOOLEAN,
        0::INTEGER,
        v_record.locked_until,
        EXTRACT(EPOCH FROM (v_record.locked_until - NOW()))::INTEGER;
      RETURN;
    ELSE
      -- Bloqueo expirado, resetear
      DELETE FROM login_attempts WHERE identifier = LOWER(p_email);
      RETURN QUERY SELECT 
        TRUE::BOOLEAN,
        v_max_attempts::INTEGER,
        NULL::TIMESTAMPTZ,
        0::INTEGER;
      RETURN;
    END IF;
  END IF;
  
  -- Si último intento fue hace más de 15 minutos, resetear
  IF v_record.last_attempt < NOW() - INTERVAL '15 minutes' THEN
    DELETE FROM login_attempts WHERE identifier = LOWER(p_email);
    RETURN QUERY SELECT 
      TRUE::BOOLEAN,
      v_max_attempts::INTEGER,
      NULL::TIMESTAMPTZ,
      0::INTEGER;
    RETURN;
  END IF;
  
  -- Retornar intentos restantes
  RETURN QUERY SELECT 
    TRUE::BOOLEAN,
    (v_max_attempts - v_record.attempt_count)::INTEGER,
    NULL::TIMESTAMPTZ,
    0::INTEGER;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para registrar intento fallido
CREATE OR REPLACE FUNCTION record_failed_login(p_email VARCHAR)
RETURNS TABLE (
  is_now_locked BOOLEAN,
  locked_until_ts TIMESTAMPTZ,
  attempts_made INTEGER
) AS $$
DECLARE
  v_max_attempts INTEGER := 5;
  v_lockout_minutes INTEGER := 15;
  v_new_count INTEGER;
  v_lock_time TIMESTAMPTZ;
BEGIN
  -- Insertar o actualizar
  INSERT INTO login_attempts (identifier, attempt_count, last_attempt)
  VALUES (LOWER(p_email), 1, NOW())
  ON CONFLICT (identifier) DO UPDATE SET
    attempt_count = login_attempts.attempt_count + 1,
    last_attempt = NOW()
  RETURNING attempt_count INTO v_new_count;
  
  -- Si alcanzó el límite, bloquear
  IF v_new_count >= v_max_attempts THEN
    v_lock_time := NOW() + (v_lockout_minutes || ' minutes')::INTERVAL;
    
    UPDATE login_attempts
    SET locked_until = v_lock_time
    WHERE identifier = LOWER(p_email);
    
    RETURN QUERY SELECT 
      TRUE::BOOLEAN,
      v_lock_time,
      v_new_count;
    RETURN;
  END IF;
  
  RETURN QUERY SELECT 
    FALSE::BOOLEAN,
    NULL::TIMESTAMPTZ,
    v_new_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para resetear intentos (login exitoso)
CREATE OR REPLACE FUNCTION reset_login_attempts(p_email VARCHAR)
RETURNS VOID AS $$
BEGIN
  DELETE FROM login_attempts WHERE identifier = LOWER(p_email);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función de limpieza automática (registros > 24 horas)
CREATE OR REPLACE FUNCTION cleanup_old_login_attempts()
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM login_attempts 
  WHERE last_attempt < NOW() - INTERVAL '24 hours'
  RETURNING COUNT(*) INTO v_deleted;
  
  RETURN COALESCE(v_deleted, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS: Solo service_role puede acceder
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access login_attempts" 
  ON login_attempts 
  FOR ALL 
  TO service_role 
  USING (true) 
  WITH CHECK (true);

-- Grants para funciones
GRANT EXECUTE ON FUNCTION check_login_attempt(VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION record_failed_login(VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION reset_login_attempts(VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_old_login_attempts() TO service_role;
