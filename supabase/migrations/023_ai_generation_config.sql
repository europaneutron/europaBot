-- Migration 023: AI Pattern Generation Config
-- Agrega funciones wrapper para Vault y configuraciones de IA en bot_config.
-- Vault (supabase_vault v0.3.1) ya esta instalado en el proyecto.

-- Funcion para guardar un secreto en Vault (upsert por nombre)
-- Usa vault.create_secret / vault.update_secret (APIs nativas de supabase_vault)
CREATE OR REPLACE FUNCTION store_vault_secret(secret_name TEXT, secret_value TEXT, secret_description TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  existing_id UUID;
  result_id UUID;
BEGIN
  SELECT id INTO existing_id FROM vault.secrets WHERE name = secret_name;
  
  IF existing_id IS NOT NULL THEN
    PERFORM vault.update_secret(existing_id, secret_value, secret_name, COALESCE(secret_description, ''));
    result_id := existing_id;
  ELSE
    result_id := vault.create_secret(secret_value, secret_name, COALESCE(secret_description, ''));
  END IF;
  
  RETURN result_id;
END;
$$;

-- Funcion para leer un secreto desencriptado del Vault
CREATE OR REPLACE FUNCTION read_vault_secret(secret_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result TEXT;
BEGIN
  SELECT decrypted_secret INTO result 
  FROM vault.decrypted_secrets 
  WHERE name = secret_name;
  
  RETURN result;
END;
$$;

-- Funcion para verificar si un secreto existe (sin revelar su valor)
CREATE OR REPLACE FUNCTION check_vault_secret(secret_name TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  secret_exists BOOLEAN;
  raw_secret TEXT;
  last_chars TEXT;
  updated TIMESTAMPTZ;
BEGIN
  SELECT 
    TRUE, 
    decrypted_secret,
    s.updated_at
  INTO secret_exists, raw_secret, updated
  FROM vault.decrypted_secrets ds
  JOIN vault.secrets s ON s.id = ds.id
  WHERE ds.name = secret_name;
  
  IF secret_exists IS NULL THEN
    RETURN json_build_object('exists', false);
  END IF;
  
  -- Solo devolver ultimos 4 caracteres
  last_chars := RIGHT(raw_secret, 4);
  
  RETURN json_build_object(
    'exists', true,
    'last_chars', last_chars,
    'updated_at', updated
  );
END;
$$;

-- Funcion para eliminar un secreto del Vault
CREATE OR REPLACE FUNCTION delete_vault_secret(secret_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  existing_id UUID;
BEGIN
  SELECT id INTO existing_id FROM vault.secrets WHERE name = secret_name;
  IF existing_id IS NULL THEN
    RETURN FALSE;
  END IF;
  DELETE FROM vault.secrets WHERE id = existing_id;
  RETURN TRUE;
END;
$$;

-- Configuraciones de IA en bot_config
INSERT INTO bot_config (config_key, config_value, config_type, description, category, is_editable) VALUES
  ('ai_model', 'gpt-4o-mini', 'string', 'Modelo de OpenAI a utilizar para generacion de patrones', 'ai', true),
  ('ai_business_context', '', 'string', 'Descripcion del negocio que se inyecta como contexto al generar patrones con IA', 'ai', true)
ON CONFLICT (config_key) DO NOTHING;
