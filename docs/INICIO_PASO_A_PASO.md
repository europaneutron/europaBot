# Inicio del Proyecto - Paso a Paso

**Fecha de inicio:** 2025-10-21  
**Objetivo:** Crear el bot conversacional de Europa desde cero, paso por paso.

---

## 📋 **Checklist General**

- [x] Paso 1: Crear proyecto Next.js
- [x] Paso 2: Configurar Supabase
- [x] Paso 3: Crear esquema de base de datos
- [x] Paso 4: Seed de datos iniciales (intenciones)
- [x] Paso 5: Implementar fuzzy matcher
- [x] Paso 6: Crear repositorios
- [x] Paso 7: Webhook de WhatsApp
- [x] Paso 8: Message Processor
- [ ] Paso 9: Testing local (interfaz web)
- [ ] Paso 10: Dashboard básico
- [ ] Paso 11: Testing y deployment

---

## 🚀 **PASO 1: Crear Proyecto Next.js**

### Comandos a ejecutar:

```bash
# Navegar a tu carpeta de proyectos
cd ~/Proyectosnext/

# Crear proyecto Next.js 14 (versión estable con mejor documentación)
npx create-next-app@14 europabot

# Durante la instalación, seleccionar:
# ✅ TypeScript: Yes
# ✅ ESLint: Yes
# ✅ Tailwind CSS: Yes
# ✅ src/ directory: Yes
# ✅ App Router: Yes
# ✅ Import alias: Yes (@/*)

# Entrar al proyecto
cd europabot

# Instalar dependencias principales
npm install @supabase/supabase-js @supabase/auth-helpers-nextjs
npm install fastest-levenshtein
npm install date-fns
npm install zod

# Dependencias de desarrollo
npm install -D @types/node

# Para el dashboard (Shadcn UI)
npx shadcn-ui@latest init

# Durante shadcn init:
# Style: Default
# Base color: Slate
# CSS variables: Yes
```

### Crear estructura de carpetas:

```bash
# Dentro de europabot/
mkdir -p src/core/{intent-engine,conversation,fallback,appointment,scoring}
mkdir -p src/services/{whatsapp,supabase,storage}
mkdir -p src/data/{repositories,models}
mkdir -p src/lib/{utils,constants,config}
mkdir -p src/types
```

### Verificar:

```bash
npm run dev
# Debe abrir http://localhost:3000 con la página de Next.js
```

**✅ Confirmame cuando hayas completado este paso antes de continuar.**

---

## 🗄️ **PASO 2: Configurar Supabase**

### 2.1 Crear proyecto en Supabase

1. Ir a https://supabase.com/dashboard
2. Clic en "New Project"
3. Configurar:
   - **Name**: `europabot`
   - **Database Password**: (guarda esto en lugar seguro)
   - **Region**: `South America (São Paulo)` (más cercano a México)
   - **Pricing Plan**: Free
4. Esperar ~2 minutos mientras se crea

### 2.2 Guardar credenciales

Una vez creado el proyecto, ir a **Project Settings** > **API**:

- `Project URL`: https://xxxxxxxxxxx.supabase.co
- `anon/public key`: eyJhbGc...
- `service_role key`: eyJhbGc... (¡SECRETO!)

### 2.3 Crear archivo `.env.local`

En la raíz de `europabot/`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key-aqui
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key-aqui

# WhatsApp (los que ya tienes)
WHATSAPP_API_TOKEN=EAB5uTpjspNQBPrcPfS657pz8XmREClzIcq0YHIYPDZBhl8daW73NXUNZAsNhB6rpFZCeTmjqEE0tFAezj18p9dcm5Pt7RmlyxArkDFjZBAhFCZBa79iL8LxTWRO33cM6y7iEr08xrVCurskYtMWM77afVirZBVEk4KEjcaBBByXGjWZArZC5ZBbdLmiEZBwd09wQZDZD
WHATSAPP_PHONE_NUMBER_ID=458574770662643
WHATSAPP_BUSINESS_ACCOUNT_ID=426465080551599
WHATSAPP_WEBHOOK_VERIFY_TOKEN=europa_bot_verify_2025_secure

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=genera-un-string-aleatorio-aqui
```

### 2.4 Instalar Supabase CLI (opcional pero recomendado)

```bash
npm install -g supabase

# Inicializar en el proyecto
cd europabot
supabase init

# Vincular con proyecto remoto
supabase link --project-ref tu-project-ref
# (El project-ref está en la URL de Supabase)
```

**✅ Confirmame cuando tengas Supabase configurado.**

---

## 📊 **PASO 3: Crear Base de Datos**

### 3.1 Crear archivo de migración

Crear `supabase/migrations/20251021000001_initial_schema.sql`:

```sql
-- ============================================
-- MIGRACIÓN INICIAL - BOT EUROPA
-- ============================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLA: users
-- ============================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255),
  
  is_bot_active BOOLEAN DEFAULT true,
  current_state VARCHAR(50) DEFAULT 'active',
  
  lead_score INTEGER DEFAULT 0,
  lead_status VARCHAR(20) DEFAULT 'cold',
  
  first_contact_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_interaction_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  preferred_language VARCHAR(10) DEFAULT 'es',
  timezone VARCHAR(50) DEFAULT 'America/Mexico_City',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_phone ON users(phone_number);
CREATE INDEX idx_users_lead_status ON users(lead_status);
CREATE INDEX idx_users_last_interaction ON users(last_interaction_at DESC);

-- ============================================
-- TABLA: user_sessions
-- ============================================
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  
  current_flow VARCHAR(50),
  last_intent_detected VARCHAR(50),
  
  fallback_attempts INTEGER DEFAULT 0,
  last_fallback_at TIMESTAMP WITH TIME ZONE,
  
  conversation_context JSONB DEFAULT '[]'::jsonb,
  
  session_started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON user_sessions(user_id);

-- ============================================
-- TABLA: user_progress
-- ============================================
CREATE TABLE user_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  
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
  
  appointment_offered BOOLEAN DEFAULT false,
  appointment_offered_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_progress_user ON user_progress(user_id);

-- ============================================
-- TABLA: conversations
-- ============================================
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  message_id VARCHAR(255),
  direction VARCHAR(10) NOT NULL,
  
  message_text TEXT,
  message_type VARCHAR(20) DEFAULT 'text',
  media_url TEXT,
  
  detected_intent VARCHAR(50),
  intent_confidence DECIMAL(3,2),
  
  was_fallback BOOLEAN DEFAULT false,
  fallback_level INTEGER,
  
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_conversations_user ON conversations(user_id);
CREATE INDEX idx_conversations_sent_at ON conversations(sent_at DESC);
CREATE INDEX idx_conversations_intent ON conversations(detected_intent);

-- ============================================
-- TABLA: intents_log
-- ============================================
CREATE TABLE intents_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  
  intent_name VARCHAR(50) NOT NULL,
  confidence_score DECIMAL(3,2),
  
  matched_keywords TEXT[],
  fuzzy_matches JSONB,
  
  original_message TEXT,
  normalized_message TEXT,
  
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_intents_log_user ON intents_log(user_id);
CREATE INDEX idx_intents_log_intent ON intents_log(intent_name);
CREATE INDEX idx_intents_log_date ON intents_log(detected_at DESC);

-- ============================================
-- TABLA: appointments
-- ============================================
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  appointment_date DATE NOT NULL,
  time_slot VARCHAR(20) NOT NULL,
  time_slot_start TIME NOT NULL,
  time_slot_end TIME NOT NULL,
  
  status VARCHAR(20) DEFAULT 'confirmed',
  
  contact_name VARCHAR(255),
  contact_phone VARCHAR(20),
  
  reminder_sent BOOLEAN DEFAULT false,
  reminder_sent_at TIMESTAMP WITH TIME ZONE,
  
  assigned_to UUID,
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_appointments_user ON appointments(user_id);
CREATE INDEX idx_appointments_date ON appointments(appointment_date);
CREATE INDEX idx_appointments_status ON appointments(status);

-- ============================================
-- TABLA: scheduled_followups
-- ============================================
CREATE TABLE scheduled_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  followup_type VARCHAR(20) NOT NULL,
  delay_hours INTEGER NOT NULL,
  
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  
  message_template VARCHAR(50),
  message_variables JSONB,
  
  status VARCHAR(20) DEFAULT 'pending',
  executed_at TIMESTAMP WITH TIME ZONE,
  
  user_responded BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_followups_user ON scheduled_followups(user_id);
CREATE INDEX idx_followups_scheduled ON scheduled_followups(scheduled_for);
CREATE INDEX idx_followups_status ON scheduled_followups(status);

-- ============================================
-- TABLA: resources
-- ============================================
CREATE TABLE resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  resource_type VARCHAR(20) NOT NULL,
  intent_category VARCHAR(50),
  
  title VARCHAR(255) NOT NULL,
  description TEXT,
  
  file_path TEXT,
  file_url TEXT,
  external_url TEXT,
  
  file_size INTEGER,
  mime_type VARCHAR(100),
  
  is_active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_resources_type ON resources(resource_type);
CREATE INDEX idx_resources_intent ON resources(intent_category);

-- ============================================
-- TABLA: intent_configurations (EDITABLE)
-- ============================================
CREATE TABLE intent_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  intent_name VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  
  keywords TEXT[] NOT NULL DEFAULT '{}',
  synonyms TEXT[] NOT NULL DEFAULT '{}',
  typos TEXT[] NOT NULL DEFAULT '{}',
  phrases TEXT[] NOT NULL DEFAULT '{}',
  
  min_confidence DECIMAL(3,2) DEFAULT 0.75,
  priority INTEGER DEFAULT 0,
  
  response_template TEXT,
  response_type VARCHAR(20) DEFAULT 'text',
  
  is_active BOOLEAN DEFAULT true,
  is_checkpoint BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_intent_configs_name ON intent_configurations(intent_name);
CREATE INDEX idx_intent_configs_active ON intent_configurations(is_active);

-- ============================================
-- TABLA: bot_responses (EDITABLE)
-- ============================================
CREATE TABLE bot_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  intent_name VARCHAR(50) REFERENCES intent_configurations(intent_name) ON DELETE CASCADE,
  
  response_key VARCHAR(50) NOT NULL,
  message_text TEXT NOT NULL,
  media_url TEXT,
  
  -- Variables dinámicas para personalizar respuestas
  variables JSONB,
  
  is_active BOOLEAN DEFAULT true,
  order_priority INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_bot_responses_intent ON bot_responses(intent_name);
CREATE INDEX idx_bot_responses_key ON bot_responses(response_key);

COMMENT ON TABLE bot_responses IS 'Respuestas conversacionales puras, sin botones ni menús';

-- ============================================
-- TABLA: bot_status
-- ============================================
CREATE TABLE bot_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  
  is_active BOOLEAN DEFAULT true,
  paused_reason VARCHAR(50),
  
  controlled_by UUID,
  control_started_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_bot_status_user ON bot_status(user_id);

-- ============================================
-- TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_sessions_updated_at BEFORE UPDATE ON user_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_progress_updated_at BEFORE UPDATE ON user_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_resources_updated_at BEFORE UPDATE ON resources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_intent_configs_updated_at BEFORE UPDATE ON intent_configurations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bot_responses_updated_at BEFORE UPDATE ON bot_responses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bot_status_updated_at BEFORE UPDATE ON bot_status
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 3.2 Aplicar migración

**Opción A: Con Supabase CLI (recomendado)**
```bash
supabase db reset  # Si estás en local
supabase db push   # Para producción
```

**Opción B: Manual en Supabase Dashboard**
1. Ir a https://supabase.com/dashboard
2. Tu proyecto > SQL Editor
3. Copiar y pegar todo el SQL de arriba
4. Run

**✅ Confirmame cuando la base de datos esté creada.**

---

## 🌱 **PASO 4: Seed de Datos Iniciales**

Vamos a poblar las intenciones configurables.

**Pendiente: Te enviaré el script de seed en el siguiente mensaje una vez confirmes los pasos anteriores.**

---

**¿Estás list@ para empezar con el Paso 1?**
