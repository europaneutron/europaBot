# Esquema de Base de Datos - Bot Europa

**Base de datos**: PostgreSQL (Supabase)  
**Nomenclatura**: snake_case  
**Última actualización**: 2025-10-21

---

## 1. Diagrama de Relaciones

```
users (1) ──── (N) conversations
  │                     │
  │                     └── (N) messages
  │
  ├── (1) user_sessions (1)
  │
  ├── (1) user_progress (1)
  │
  ├── (N) appointments
  │
  └── (N) scheduled_followups
```

---

## 2. Tablas Principales

### 2.1 `users`

Información básica de cada usuario que interactúa con el bot.

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255),
  
  -- Estado del usuario
  is_bot_active BOOLEAN DEFAULT true,
  current_state VARCHAR(50) DEFAULT 'active', -- active, waiting_response, paused, archived
  
  -- Lead scoring
  lead_score INTEGER DEFAULT 0,
  lead_status VARCHAR(20) DEFAULT 'cold', -- cold, warm, hot
  
  -- Metadata
  first_contact_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_interaction_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Preferencias
  preferred_language VARCHAR(10) DEFAULT 'es',
  timezone VARCHAR(50) DEFAULT 'America/Mexico_City',
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_users_phone ON users(phone_number);
CREATE INDEX idx_users_lead_status ON users(lead_status);
CREATE INDEX idx_users_last_interaction ON users(last_interaction_at DESC);
```

---

### 2.2 `user_sessions`

Estado conversacional actual de cada usuario.

```sql
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  
  -- Estado de la conversación
  current_flow VARCHAR(50), -- general, appointment_day, appointment_time, waiting_asesor
  last_intent_detected VARCHAR(50),
  
  -- Contador de fallback
  fallback_attempts INTEGER DEFAULT 0,
  last_fallback_at TIMESTAMP WITH TIME ZONE,
  
  -- Contexto conversacional (últimos 5 mensajes)
  conversation_context JSONB DEFAULT '[]'::jsonb,
  
  -- Metadata
  session_started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON user_sessions(user_id);
```

---

### 2.3 `user_progress`

Tracking de qué información ya recibió el usuario (checkpoints).

```sql
CREATE TABLE user_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  
  -- Checkpoints completados (6 temas)
  precio_completed BOOLEAN DEFAULT false,
  precio_completed_at TIMESTAMP WITH TIME ZONE,
  
  ubicacion_completed BOOLEAN DEFAULT false,
  ubicacion_completed_at TIMESTAMP WITH TIME ZONE,
  
  modelo_completed BOOLEAN DEFAULT false,
  modelo_completed_at TIMESTAMP WITH TIME ZONE,
  
  creditos_completed BOOLEAN DEFAULT false,
  creditos_completed_at TIMESTAMP WITH TIME ZONE,
  
  seguridad_completed BOOLEAN DEFAULT false,
  seguridad_completed_at TIMESTAMP WITH TIME ZONE,
  
  brochure_completed BOOLEAN DEFAULT false,
  brochure_completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Control de oferta de cita
  appointment_offered BOOLEAN DEFAULT false,
  appointment_offered_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_progress_user ON user_progress(user_id);

-- Función helper para calcular checkpoints completados
CREATE OR REPLACE FUNCTION count_completed_checkpoints(user_progress_row user_progress)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    (CASE WHEN user_progress_row.precio_completed THEN 1 ELSE 0 END) +
    (CASE WHEN user_progress_row.ubicacion_completed THEN 1 ELSE 0 END) +
    (CASE WHEN user_progress_row.modelo_completed THEN 1 ELSE 0 END) +
    (CASE WHEN user_progress_row.creditos_completed THEN 1 ELSE 0 END) +
    (CASE WHEN user_progress_row.seguridad_completed THEN 1 ELSE 0 END) +
    (CASE WHEN user_progress_row.brochure_completed THEN 1 ELSE 0 END)
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

---

### 2.4 `conversations`

Historial completo de conversaciones.

```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  -- Información del mensaje
  message_id VARCHAR(255), -- ID del mensaje en WhatsApp
  direction VARCHAR(10) NOT NULL, -- incoming, outgoing
  
  -- Contenido
  message_text TEXT,
  message_type VARCHAR(20) DEFAULT 'text', -- text, image, audio, video, document
  media_url TEXT,
  
  -- Detección de intención
  detected_intent VARCHAR(50),
  intent_confidence DECIMAL(3,2),
  
  -- Contexto
  was_fallback BOOLEAN DEFAULT false,
  fallback_level INTEGER, -- 1, 2, 3
  
  -- Metadata
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_conversations_user ON conversations(user_id);
CREATE INDEX idx_conversations_sent_at ON conversations(sent_at DESC);
CREATE INDEX idx_conversations_intent ON conversations(detected_intent);
```

---

### 2.5 `intents_log`

Registro detallado de cada intención detectada (para análisis y mejora).

```sql
CREATE TABLE intents_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  
  -- Intención detectada
  intent_name VARCHAR(50) NOT NULL,
  confidence_score DECIMAL(3,2),
  
  -- Detalles del matching
  matched_keywords TEXT[], -- Array de keywords que hicieron match
  fuzzy_matches JSONB, -- Detalles de fuzzy matching
  
  -- Input original
  original_message TEXT,
  normalized_message TEXT,
  
  -- Metadata
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_intents_log_user ON intents_log(user_id);
CREATE INDEX idx_intents_log_intent ON intents_log(intent_name);
CREATE INDEX idx_intents_log_date ON intents_log(detected_at DESC);
```

---

### 2.6 `appointments`

Citas agendadas por los usuarios.

```sql
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  -- Detalles de la cita
  appointment_date DATE NOT NULL,
  time_slot VARCHAR(20) NOT NULL, -- temprano, media_tarde, tarde
  time_slot_start TIME NOT NULL, -- 09:00, 12:00, 16:00
  time_slot_end TIME NOT NULL,   -- 11:00, 15:00, 19:00
  
  -- Estado
  status VARCHAR(20) DEFAULT 'confirmed', -- confirmed, cancelled, completed, no_show
  
  -- Información de contacto
  contact_name VARCHAR(255),
  contact_phone VARCHAR(20),
  
  -- Recordatorios
  reminder_sent BOOLEAN DEFAULT false,
  reminder_sent_at TIMESTAMP WITH TIME ZONE,
  
  -- Asesor asignado
  assigned_to UUID, -- Referencia a tabla de asesores (futura)
  
  -- Notas
  notes TEXT,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_appointments_user ON appointments(user_id);
CREATE INDEX idx_appointments_date ON appointments(appointment_date);
CREATE INDEX idx_appointments_status ON appointments(status);
```

---

### 2.7 `scheduled_followups`

Mensajes de seguimiento automático programados.

```sql
CREATE TABLE scheduled_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  -- Configuración del seguimiento
  followup_type VARCHAR(20) NOT NULL, -- immediate, day_1, day_3, day_7
  delay_hours INTEGER NOT NULL, -- 2, 24, 72, 168
  
  -- Programación
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Mensaje
  message_template VARCHAR(50), -- Referencia a template
  message_variables JSONB, -- Variables para personalizar mensaje
  
  -- Estado
  status VARCHAR(20) DEFAULT 'pending', -- pending, sent, cancelled, failed
  executed_at TIMESTAMP WITH TIME ZONE,
  
  -- Respuesta
  user_responded BOOLEAN DEFAULT false,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_followups_user ON scheduled_followups(user_id);
CREATE INDEX idx_followups_scheduled ON scheduled_followups(scheduled_for);
CREATE INDEX idx_followups_status ON scheduled_followups(status);
```

---

### 2.8 `resources`

Archivos y recursos que el bot puede compartir.

```sql
CREATE TABLE resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Tipo de recurso
  resource_type VARCHAR(20) NOT NULL, -- pdf, video, image, link
  intent_category VARCHAR(50), -- precio, ubicacion, modelo, etc.
  
  -- Información del recurso
  title VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Ubicación
  file_path TEXT, -- Path en Supabase Storage
  file_url TEXT, -- URL pública si aplica
  external_url TEXT, -- Para links externos
  
  -- Metadata
  file_size INTEGER, -- En bytes
  mime_type VARCHAR(100),
  
  -- Control
  is_active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_resources_type ON resources(resource_type);
CREATE INDEX idx_resources_intent ON resources(intent_category);
```

---

### 2.9 `intent_configurations`

Configuración editable de intenciones desde el dashboard (NO hardcodeadas).

```sql
CREATE TABLE intent_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identificador de la intención
  intent_name VARCHAR(50) UNIQUE NOT NULL, -- precio, ubicacion, modelo, etc.
  display_name VARCHAR(100) NOT NULL, -- "Información de Precios"
  
  -- Configuración de detección
  keywords TEXT[] NOT NULL DEFAULT '{}', -- Array de palabras clave
  synonyms TEXT[] NOT NULL DEFAULT '{}', -- Array de sinónimos
  typos TEXT[] NOT NULL DEFAULT '{}', -- Array de errores comunes
  phrases TEXT[] NOT NULL DEFAULT '{}', -- Array de frases completas
  
  -- Configuración de matching
  min_confidence DECIMAL(3,2) DEFAULT 0.75, -- Umbral mínimo de confianza
  priority INTEGER DEFAULT 0, -- Para desambiguar (mayor = más prioridad)
  
  -- Respuesta automática
  response_template TEXT, -- Mensaje que envía el bot
  response_type VARCHAR(20) DEFAULT 'text', -- text, template, media
  
  -- Control
  is_active BOOLEAN DEFAULT true,
  is_checkpoint BOOLEAN DEFAULT true, -- Si cuenta para el progreso del usuario
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_intent_configs_name ON intent_configurations(intent_name);
CREATE INDEX idx_intent_configs_active ON intent_configurations(is_active);
```

---

### 2.10 `bot_responses`

Respuestas conversacionales configurables (editables desde dashboard).

```sql
CREATE TABLE bot_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relación con intención
  intent_name VARCHAR(50) REFERENCES intent_configurations(intent_name) ON DELETE CASCADE,
  
  -- Tipo de respuesta
  response_key VARCHAR(50) NOT NULL, -- main, fallback, already_asked, etc.
  
  -- Contenido conversacional puro
  message_text TEXT NOT NULL,
  media_url TEXT, -- URL de imagen/video opcional
  
  -- Variables dinámicas para personalización
  variables JSONB, -- { "precio_desde": "450000", "moneda": "MXN" }
  
  -- Control
  is_active BOOLEAN DEFAULT true,
  order_priority INTEGER DEFAULT 0, -- Para respuestas múltiples
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_bot_responses_intent ON bot_responses(intent_name);
CREATE INDEX idx_bot_responses_key ON bot_responses(response_key);

COMMENT ON TABLE bot_responses IS 'Respuestas 100% conversacionales, sin botones ni menús interactivos';
```

**Ejemplo de respuestas conversacionales:**
```sql
-- Respuesta principal para "precio"
INSERT INTO bot_responses (intent_name, response_key, message_text, variables) VALUES
('precio', 'main', 
'Los lotes inician desde ${{precio_desde}} MXN y las casas desde ${{precio_casa}} MXN. Tenemos opciones de financiamiento y aceptamos créditos bancarios. ¿Te gustaría saber sobre financiamiento o prefieres conocer otro aspecto del proyecto?',
'{"precio_desde": "450000", "precio_casa": "850000", "moneda": "MXN"}'::jsonb);

-- Si ya preguntó por precio
INSERT INTO bot_responses (intent_name, response_key, message_text) VALUES
('precio', 'already_asked',
'Ya te compartí la información de precios anteriormente. ¿Hay algo más sobre el proyecto que te gustaría saber? Por ejemplo, ubicación, modelos de casas o seguridad del fraccionamiento.');
```

---

### 2.11 `bot_status`

Control del estado del bot por usuario (pausar/reactivar).

```sql
CREATE TABLE bot_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  
  -- Estado del bot
  is_active BOOLEAN DEFAULT true,
  paused_reason VARCHAR(50), -- transferred_to_human, user_request, error
  
  -- Control manual
  controlled_by UUID, -- ID del admin que tomó control
  control_started_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_bot_status_user ON bot_status(user_id);
```

---

## 3. Triggers para Actualización Automática

```sql
-- Actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar a todas las tablas con updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_sessions_updated_at BEFORE UPDATE ON user_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_progress_updated_at BEFORE UPDATE ON user_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## 4. Row Level Security (RLS)

```sql
-- Habilitar RLS en todas las tablas
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Política: Los usuarios solo ven sus propios datos
CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (auth.uid() = id);

-- Política: Los admins ven todo
CREATE POLICY "Admins can view all" ON users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
```

---

## 5. Vistas Útiles

### Vista: Usuarios con progreso

```sql
CREATE VIEW v_users_with_progress AS
SELECT 
  u.id,
  u.phone_number,
  u.name,
  u.lead_score,
  u.lead_status,
  u.last_interaction_at,
  count_completed_checkpoints(up.*) as checkpoints_completed,
  up.appointment_offered,
  CASE 
    WHEN count_completed_checkpoints(up.*) >= 4 THEN true 
    ELSE false 
  END as ready_for_appointment
FROM users u
LEFT JOIN user_progress up ON u.id = up.user_id;
```

### Vista: Dashboard de métricas

```sql
CREATE VIEW v_dashboard_metrics AS
SELECT 
  COUNT(DISTINCT u.id) as total_users,
  COUNT(DISTINCT CASE WHEN u.last_interaction_at > NOW() - INTERVAL '24 hours' THEN u.id END) as active_today,
  COUNT(DISTINCT CASE WHEN a.status = 'confirmed' THEN a.id END) as appointments_pending,
  AVG(u.lead_score) as avg_lead_score,
  COUNT(DISTINCT CASE WHEN u.lead_status = 'hot' THEN u.id END) as hot_leads
FROM users u
LEFT JOIN appointments a ON u.id = a.user_id;
```

---

## 6. Migración Inicial

Ver archivo: `supabase/migrations/001_initial_schema.sql`

---

**Notas**:
- Usar UUIDs para todas las PKs (mejor para sistemas distribuidos)
- Todos los timestamps en UTC
- RLS habilitado desde el inicio
- Índices en columnas frecuentemente consultadas
