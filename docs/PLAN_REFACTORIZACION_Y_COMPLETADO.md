# Plan de Refactorización y Completado del Proyecto

**Fecha de creación:** 23 de octubre de 2025  
**Estado actual del proyecto:** 65% completo (funcional pero con deuda técnica)  
**Objetivo:** Completar funcionalidades faltantes, refactorizar código disperso y preparar para producción

---

## 📊 Estado Actual del Proyecto

### ✅ Módulos Funcionales (80%+)
- **Intent Engine** (100%) - Fuzzy matching funcionando
- **Sistema de Citas** (100%) - Completo con auto-offer
- **Derivación a Asesor** (95%) - Implementado, falta notificación
- **Repositorios** (100%) - Patrón repository bien aplicado
- **Webhook WhatsApp** (100%) - Producción funcionando
- **Base de Datos** (90%) - Schema completo, falta RLS

### ⚠️ Módulos con Deuda Técnica (50-70%)
- **Message Processor** - Monolítico (371 líneas)
- **Fallback System** - Embebido en message-processor
- **Constants/Config** - Dispersos, sin centralizar

### ❌ Módulos Faltantes (0%)
- **Sistema de Autenticación**
- **Dashboard Administrativo Completo**
- **Editor de Mensajes/Intenciones**
- **Componentes React Reutilizables**
- **Lead Scoring Automatizado**
- **Row Level Security (RLS)**
- **Notificación al Asesor**

---

## 🎯 Objetivos del Plan

1. **Refactorizar código existente** para mejorar mantenibilidad
2. **Implementar funcionalidades críticas faltantes** (auth, RLS, notificaciones)
3. **Crear dashboard administrativo completo** con editor de mensajes
4. **Preparar para producción** con seguridad y monitoreo

---

## 📋 Fases de Ejecución

---

## **FASE 0: Sistema de Configuración Dinámica** ⭐ **NUEVA - PRIORIDAD #1**
**Duración estimada:** 1 día  
**Prioridad:** Crítica  
**Objetivo:** Hacer el sistema 100% configurable sin necesidad de tocar código

### 0.1 Crear Tabla de Configuración

**Nueva tabla: `bot_config`**

```sql
-- supabase/migrations/009_bot_config_system.sql

-- ============================================
-- TABLA: bot_config
-- ============================================
CREATE TABLE bot_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key VARCHAR(100) UNIQUE NOT NULL,
  config_value TEXT NOT NULL,
  config_type VARCHAR(20) DEFAULT 'string',
  description TEXT,
  category VARCHAR(50) DEFAULT 'general',
  is_editable BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_bot_config_key ON bot_config(config_key);
CREATE INDEX idx_bot_config_category ON bot_config(category);

-- Constraint para tipos permitidos
ALTER TABLE bot_config
ADD CONSTRAINT bot_config_type_check 
CHECK (config_type IN ('string', 'integer', 'boolean', 'json'));

COMMENT ON TABLE bot_config IS 'Configuración dinámica del bot - editable desde dashboard';
COMMENT ON COLUMN bot_config.config_type IS 'string, integer, boolean o json';
COMMENT ON COLUMN bot_config.is_editable IS 'false para configs críticas que no deben cambiarse desde UI';

-- Trigger de updated_at
CREATE TRIGGER update_bot_config_updated_at 
BEFORE UPDATE ON bot_config
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- CONFIGURACIONES INICIALES
-- ============================================

INSERT INTO bot_config (config_key, config_value, config_type, description, category, is_editable) VALUES

-- Categoría: Checkpoints y Citas
('checkpoints_for_appointment', '4', 'integer', 'Número de checkpoints requeridos antes de ofrecer cita automáticamente', 'appointments', true),
('max_checkpoints', '6', 'integer', 'Número máximo de checkpoints disponibles (informativo)', 'appointments', false),
('appointment_auto_offer_enabled', 'true', 'boolean', 'Activar/desactivar oferta automática de citas', 'appointments', true),

-- Categoría: Lead Scoring
('checkpoint_points', '15', 'integer', 'Puntos base por cada checkpoint completado', 'scoring', true),
('appointment_points', '20', 'integer', 'Puntos adicionales por agendar cita', 'scoring', true),
('auto_offer_response_points', '10', 'integer', 'Puntos por responder al auto-offer de cita', 'scoring', true),
('lead_score_cold_max', '39', 'integer', 'Score máximo para clasificar lead como COLD', 'scoring', true),
('lead_score_warm_max', '69', 'integer', 'Score máximo para clasificar lead como WARM (70+ es HOT)', 'scoring', true),

-- Categoría: Fallback y Derivación
('max_fallback_attempts', '3', 'integer', 'Intentos de fallback antes de derivar a asesor humano', 'fallback', true),
('fallback_derivation_enabled', 'true', 'boolean', 'Activar derivación a asesor después de fallbacks', 'fallback', true),

-- Categoría: Horarios y Contacto
('business_hours', 'lunes a viernes 9:00 AM - 6:00 PM', 'string', 'Horario de atención para mostrar a usuarios', 'contact', true),
('advisor_phone', '', 'string', 'Teléfono del asesor para notificaciones (formato: +52XXXXXXXXXX)', 'contact', true),
('advisor_email', '', 'string', 'Email del asesor para notificaciones', 'contact', true),

-- Categoría: Mensajes del Bot
('welcome_message_enabled', 'true', 'boolean', 'Enviar mensaje de bienvenida a nuevos usuarios', 'messages', true),
('welcome_message', 'Hola! Soy el asistente virtual de Fraccionamiento Europa. ¿En qué puedo ayudarte hoy?', 'string', 'Mensaje de bienvenida para nuevos usuarios', 'messages', true);

-- ============================================
-- RLS PARA bot_config
-- ============================================
ALTER TABLE bot_config ENABLE ROW LEVEL SECURITY;

-- Los admins pueden ver todas las configuraciones
CREATE POLICY "Admin users can view bot config"
  ON bot_config FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

-- Solo super_admin puede modificar configuraciones editables
CREATE POLICY "Super admin can modify editable configs"
  ON bot_config FOR UPDATE
  TO authenticated
  USING (
    is_editable = true AND
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.role = 'super_admin'
      AND admin_users.is_active = true
    )
  )
  WITH CHECK (
    is_editable = true AND
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.role = 'super_admin'
      AND admin_users.is_active = true
    )
  );

-- Service role tiene acceso total
CREATE POLICY "Service role full access bot_config"
  ON bot_config FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

**Tareas:**
- [x] Crear migración 009 con tabla bot_config
- [x] Aplicar migración a BD de desarrollo
- [x] Verificar que los valores se insertaron correctamente

**✅ COMPLETADO - 5 nov 2025**

---

### 0.2 Crear Config Repository

**Archivo: `src/data/repositories/config.repository.ts`**

```typescript
/**
 * Repository para configuración dinámica del bot
 */

import { supabaseServer } from '@/services/supabase/server-client';

export interface BotConfig {
  id: string;
  config_key: string;
  config_value: string;
  config_type: 'string' | 'integer' | 'boolean' | 'json';
  description: string | null;
  category: string;
  is_editable: boolean;
  created_at: string;
  updated_at: string;
}

export class ConfigRepository {
  /**
   * Obtener valor de configuración como string
   */
  async get(key: string, defaultValue: string = ''): Promise<string> {
    const { data, error } = await supabaseServer
      .from('bot_config')
      .select('config_value')
      .eq('config_key', key)
      .single();

    if (error || !data) {
      console.warn(`Config key "${key}" not found, using default: "${defaultValue}"`);
      return defaultValue;
    }

    return data.config_value;
  }

  /**
   * Obtener valor como integer
   */
  async getInt(key: string, defaultValue: number = 0): Promise<number> {
    const value = await this.get(key);
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Obtener valor como boolean
   */
  async getBoolean(key: string, defaultValue: boolean = false): Promise<boolean> {
    const value = await this.get(key);
    return value.toLowerCase() === 'true';
  }

  /**
   * Obtener valor como JSON
   */
  async getJson<T>(key: string, defaultValue: T): Promise<T> {
    const value = await this.get(key);
    try {
      return JSON.parse(value) as T;
    } catch {
      return defaultValue;
    }
  }

  /**
   * Actualizar valor de configuración
   */
  async set(key: string, value: string): Promise<void> {
    const { error } = await supabaseServer
      .from('bot_config')
      .update({ config_value: value })
      .eq('config_key', key);

    if (error) {
      console.error(`Error updating config key "${key}":`, error);
      throw error;
    }
  }

  /**
   * Obtener todas las configuraciones (para dashboard)
   */
  async getAll(): Promise<BotConfig[]> {
    const { data, error } = await supabaseServer
      .from('bot_config')
      .select('*')
      .order('category', { ascending: true })
      .order('config_key', { ascending: true });

    if (error) {
      console.error('Error fetching all configs:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Obtener configuraciones por categoría
   */
  async getByCategory(category: string): Promise<BotConfig[]> {
    const { data, error } = await supabaseServer
      .from('bot_config')
      .select('*')
      .eq('category', category)
      .order('config_key', { ascending: true });

    if (error) {
      console.error(`Error fetching configs for category "${category}":`, error);
      return [];
    }

    return data || [];
  }

  /**
   * Actualizar múltiples configuraciones (batch update)
   */
  async updateMultiple(updates: Array<{ key: string; value: string }>): Promise<void> {
    for (const { key, value } of updates) {
      await this.set(key, value);
    }
  }
}

export const configRepository = new ConfigRepository();
```

**Tareas:**
- [x] Crear `src/data/repositories/config.repository.ts`
- [x] Exportar en `src/data/repositories/index.ts`
- [x] Testing: Leer y escribir configuraciones

**✅ COMPLETADO - 5 nov 2025**

---

### 0.3 Integrar Configuración en Message Processor

**Modificar: `src/core/conversation/message-processor.ts`**

Reemplazar valores hardcodeados por configuración dinámica:

```typescript
// Importar config repository
import { configRepository } from '@/data/repositories/config.repository';

// Antes (línea ~78):
// if (completedCount >= 4 && !progress.appointment_offered) {

// Después:
const checkpointsRequired = await configRepository.getInt('checkpoints_for_appointment', 4);
const autoOfferEnabled = await configRepository.getBoolean('appointment_auto_offer_enabled', true);

if (autoOfferEnabled && completedCount >= checkpointsRequired && !progress.appointment_offered) {
  // Ofrecer cita automáticamente
}
```

**Tareas:**
- [x] Reemplazar `>= 4` por configuración dinámica
- [x] Reemplazar puntos hardcodeados (15) por configuración dinámica
- [x] Hacer configurable max_fallback_attempts y fallback_derivation_enabled
- [x] Testing: Cambiar umbral de citas desde BD y verificar

**✅ COMPLETADO - 5 nov 2025**

---

### 0.4 Página de Configuración en Dashboard

**Crear: `src/app/(dashboard)/settings/page.tsx`**

Pantalla para editar configuraciones desde el dashboard (solo super_admin).

**UI sugerida:**
```
Configuración del Bot
─────────────────────

📋 Checkpoints y Citas
  Checkpoints requeridos para cita: [4] (máx: 6)
  ☑ Activar oferta automática de citas

📊 Lead Scoring
  Puntos por checkpoint: [15]
  Puntos por cita agendada: [20]
  Puntos por responder auto-offer: [10]
  
  Lead COLD: 0 - [39] puntos
  Lead WARM: 40 - [69] puntos
  Lead HOT: 70+ puntos

🔄 Fallback y Derivación
  Intentos de fallback máximos: [3]
  ☑ Derivar a asesor después de fallbacks

📞 Horarios y Contacto
  Horario de atención: [lunes a viernes 9:00 AM - 6:00 PM]
  Teléfono del asesor: [+52XXXXXXXXXX]
  Email del asesor: [asesor@europa.com]

💬 Mensajes
  ☑ Enviar mensaje de bienvenida
  Mensaje de bienvenida:
  [Hola! Soy el asistente virtual...]

[Guardar Cambios]  [Restaurar Valores por Defecto]
```

**Tareas:**
- [x] Crear página de configuración
- [x] Formulario con validación
- [x] Guardar cambios con `configRepository.updateMultiple()`
- [ ] Solo accesible para super_admin (pendiente de auth)

**✅ COMPLETADO - 5 nov 2025** (pendiente protección de ruta con auth)

---

## **FASE 1: Editor de Intenciones desde Dashboard** ⭐ **PRIORIDAD #2**
**Duración estimada:** 2 días  
**Prioridad:** Crítica  
**Objetivo:** Permitir agregar/editar intenciones sin tocar código

### 1.1 Crear Intent Config Repository

**Archivo: `src/data/repositories/intent-config.repository.ts`**

```typescript
/**
 * Repository para gestión de intenciones y respuestas
 */

import { supabaseServer } from '@/services/supabase/server-client';

export interface IntentConfiguration {
  id: string;
  intent_name: string;
  display_name: string;
  keywords: string[];
  synonyms: string[];
  typos: string[];
  phrases: string[];
  min_confidence: number;
  priority: number;
  response_template: string | null;
  response_type: string;
  is_active: boolean;
  is_checkpoint: boolean;
  created_at: string;
  updated_at: string;
}

export interface BotResponse {
  id: string;
  intent_name: string;
  response_key: string;
  message_text: string;
  media_url: string | null;
  variables: any;
  is_active: boolean;
  order_priority: number;
  created_at: string;
  updated_at: string;
}

export class IntentConfigRepository {
  /**
   * Obtener todas las intenciones
   */
  async getAll(): Promise<IntentConfiguration[]> {
    const { data, error } = await supabaseServer
      .from('intent_configurations')
      .select('*')
      .order('priority', { ascending: false })
      .order('display_name', { ascending: true });

    if (error) {
      console.error('Error fetching intent configs:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Obtener intención por nombre
   */
  async getByName(intentName: string): Promise<IntentConfiguration | null> {
    const { data, error } = await supabaseServer
      .from('intent_configurations')
      .select('*')
      .eq('intent_name', intentName)
      .single();

    if (error) {
      console.error(`Error fetching intent "${intentName}":`, error);
      return null;
    }

    return data;
  }

  /**
   * Crear nueva intención
   */
  async create(data: Omit<IntentConfiguration, 'id' | 'created_at' | 'updated_at'>): Promise<IntentConfiguration> {
    const { data: intent, error } = await supabaseServer
      .from('intent_configurations')
      .insert(data)
      .select()
      .single();

    if (error) {
      console.error('Error creating intent:', error);
      throw error;
    }

    return intent;
  }

  /**
   * Actualizar intención existente
   */
  async update(id: string, data: Partial<IntentConfiguration>): Promise<void> {
    const { error } = await supabaseServer
      .from('intent_configurations')
      .update(data)
      .eq('id', id);

    if (error) {
      console.error(`Error updating intent ${id}:`, error);
      throw error;
    }
  }

  /**
   * Eliminar intención (desactivar)
   */
  async delete(id: string): Promise<void> {
    // No eliminar físicamente, solo desactivar
    await this.update(id, { is_active: false });
  }

  /**
   * Obtener respuestas de una intención
   */
  async getResponsesByIntent(intentName: string): Promise<BotResponse[]> {
    const { data, error } = await supabaseServer
      .from('bot_responses')
      .select('*')
      .eq('intent_name', intentName)
      .order('order_priority', { ascending: true });

    if (error) {
      console.error(`Error fetching responses for "${intentName}":`, error);
      return [];
    }

    return data || [];
  }

  /**
   * Crear respuesta para una intención
   */
  async createResponse(data: Omit<BotResponse, 'id' | 'created_at' | 'updated_at'>): Promise<BotResponse> {
    const { data: response, error } = await supabaseServer
      .from('bot_responses')
      .insert(data)
      .select()
      .single();

    if (error) {
      console.error('Error creating response:', error);
      throw error;
    }

    return response;
  }

  /**
   * Actualizar respuesta
   */
  async updateResponse(id: string, data: Partial<BotResponse>): Promise<void> {
    const { error } = await supabaseServer
      .from('bot_responses')
      .update(data)
      .eq('id', id);

    if (error) {
      console.error(`Error updating response ${id}:`, error);
      throw error;
    }
  }

  /**
   * Eliminar respuesta
   */
  async deleteResponse(id: string): Promise<void> {
    const { error } = await supabaseServer
      .from('bot_responses')
      .delete()
      .eq('id', id);

    if (error) {
      console.error(`Error deleting response ${id}:`, error);
      throw error;
    }
  }
}

export const intentConfigRepository = new IntentConfigRepository();
```

**Tareas:**
- [x] Crear `intent-config.repository.ts`
- [x] Exportar en `src/data/repositories/index.ts`
- [x] Testing: CRUD de intenciones y respuestas

**✅ COMPLETADO - 5 nov 2025**

---

### 1.2 Páginas del Dashboard para Intenciones

**Estructura:**
```
src/app/(dashboard)/
├── intents/
│   ├── page.tsx                    # Lista de todas las intenciones
│   ├── new/
│   │   └── page.tsx                # Crear nueva intención
│   └── [intentId]/
│       ├── page.tsx                # Editar intención
│       └── responses/
│           └── page.tsx            # Gestionar respuestas de la intención
```

**Página: `src/app/(dashboard)/intents/page.tsx`**

Lista de intenciones con acciones:
```
Intenciones del Bot
───────────────────

[+ Nueva Intención]

┌──────────────────────────────────────────────────────┐
│ Nombre            | Estado | Checkpoint | Acciones   │
├──────────────────────────────────────────────────────┤
│ 🏠 Precio         | ✅ Activo | ✅ Sí    | [Editar] [Respuestas] │
│ 📍 Ubicación      | ✅ Activo | ✅ Sí    | [Editar] [Respuestas] │
│ 🏡 Modelos        | ✅ Activo | ✅ Sí    | [Editar] [Respuestas] │
│ 💳 Créditos       | ✅ Activo | ✅ Sí    | [Editar] [Respuestas] │
│ 🛡️ Seguridad      | ✅ Activo | ✅ Sí    | [Editar] [Respuestas] │
│ 📄 Brochure       | ✅ Activo | ✅ Sí    | [Editar] [Respuestas] │
└──────────────────────────────────────────────────────┘
```

**Tareas:**
- [x] Crear página de lista de intenciones
- [x] Tabla con intenciones existentes
- [x] Botón para crear nueva intención
- [x] Links a editar y gestionar respuestas

**✅ COMPLETADO - 5 nov 2025**

---

### 1.3 Formulario de Editor de Intenciones

**Página: `src/app/(dashboard)/intents/[intentId]/page.tsx`**

```typescript
// Formulario completo con validación
- Input: Nombre interno (intent_name) - solo minúsculas y guiones
- Input: Nombre visible (display_name)
- Textarea: Keywords (separadas por coma, convertir a array)
- Textarea: Sinónimos
- Textarea: Typos comunes
- Textarea: Frases completas
- Slider: Confianza mínima (0.75 - 1.0)
- Number: Prioridad (0-100, más alto = más prioritario)
- Switch: Es checkpoint
- Switch: Está activa
- Button: Guardar | Cancelar
```

**Validaciones:**
- intent_name: solo lowercase, sin espacios
- Keywords: al menos 3 keywords requeridas
- Display name: requerido

**Tareas:**
- [x] Crear formulario de edición
- [x] Validación de campos
- [x] Guardar cambios con `intentConfigRepository.update()`
- [x] Feedback visual (toast de éxito/error)

**✅ COMPLETADO - 5 nov 2025**

---

### 1.4 Gestión de Respuestas por Intención

**Página: `src/app/(dashboard)/intents/[intentId]/responses/page.tsx`**

```
Respuestas para: Precio
────────────────────────

[+ Agregar Respuesta]

┌─────────────────────────────────────────────────┐
│ Clave          | Mensaje                | Orden │
├─────────────────────────────────────────────────┤
│ main_response  | "Nuestras casas desde..."| 1   │ [Editar] [Eliminar]
│ followup       | "¿Te gustaría saber..."  | 2   │ [Editar] [Eliminar]
└─────────────────────────────────────────────────┘

Crear/Editar Respuesta
─────────────────────
Response Key: [main_response]
Mensaje:
[Textarea con preview en tiempo real]

Media URL (opcional): [https://...]
Orden de prioridad: [1]
☑ Activa

[Guardar]  [Cancelar]
```

**Tareas:**
- [x] Lista de respuestas para la intención
- [x] Formulario para crear/editar respuestas
- [ ] Preview del mensaje en tiempo real (opcional)
- [ ] Ordenar respuestas (drag & drop opcional - no crítico)
- [x] Eliminar respuestas

**✅ COMPLETADO - 5 nov 2025** (features opcionales pendientes)

---

## **FASE 2: Refactorización Core (Sin Romper Nada)**
**Duración estimada:** 2-3 días  
**Prioridad:** Alta  
**Objetivo:** Mejorar arquitectura sin afectar funcionalidad

### 1.1 Extraer Lógica de Fallback

**Problema actual:**
```typescript
// ❌ ACTUAL: message-processor.ts (líneas 241-301)
private async handleFallback(userId: string, messageText: string): Promise<ProcessedResponse> {
  // 60 líneas de lógica de fallback dentro del processor
}
```

**Solución:**
```
src/core/fallback/
├── fallback-handler.ts      # Clase FallbackHandler
├── fallback-messages.ts     # Constantes de mensajes por nivel
└── index.ts
```

**Tareas:**
- [ ] Crear `src/core/fallback/fallback-messages.ts`
- [ ] Crear `src/core/fallback/fallback-handler.ts`
- [ ] Mover lógica desde message-processor a FallbackHandler
- [ ] Actualizar imports en message-processor
- [ ] Testing: Verificar que 3 fallbacks consecutivos sigan funcionando

**Archivos a modificar:**
- `src/core/conversation/message-processor.ts` (reducir ~60 líneas)
- `src/core/fallback/fallback-handler.ts` (nuevo)
- `src/core/fallback/fallback-messages.ts` (nuevo)

---

### 1.2 Implementar Lead Scoring Automatizado

**Problema actual:**
- Campo `lead_score` existe en BD pero no se actualiza automáticamente
- Campo `lead_status` (cold/warm/hot) no se calcula

**Solución:**
```
src/core/scoring/
├── lead-scorer.ts           # Lógica de scoring
└── index.ts
```

**Reglas de negocio:**
```typescript
// 15 puntos por checkpoint completado (máximo 90)
// 20 puntos si tiene cita agendada
// 10 puntos si respondió a auto-offer

// Status:
// cold: 0-39 puntos
// warm: 40-69 puntos
// hot: 70+ puntos
```

**Tareas:**
- [ ] Crear `src/core/scoring/lead-scorer.ts`
- [ ] Método `calculateScore(userId)` que revise checkpoints
- [ ] Método `updateLeadStatus(userId, score)` que actualice BD
- [ ] Integrar en message-processor después de marcar checkpoint
- [ ] Integrar en appointment-manager al crear cita

**Archivos a modificar:**
- `src/core/scoring/lead-scorer.ts` (nuevo)
- `src/core/conversation/message-processor.ts` (llamar scorer)
- `src/core/appointment/appointment-manager.ts` (llamar scorer)

---

### 1.3 Centralizar Constantes

**Problema actual:**
- Mensajes hardcodeados en múltiples archivos
- Sin constantes TypeScript para intenciones
- Configuración dispersa

**Solución:**
```
src/lib/constants/
├── intents.ts               # INTENT_PATTERNS, INTENT_TOPICS
├── messages.ts              # Mensajes del bot centralizados
├── time-slots.ts            # Horarios de citas
└── checkpoints.ts           # Definición de 6 checkpoints
```

**Tareas:**
- [ ] Crear `src/lib/constants/intents.ts` con tipos e intenciones
- [ ] Crear `src/lib/constants/messages.ts` con todos los mensajes
- [ ] Crear `src/lib/constants/checkpoints.ts` con mapeo
- [ ] Refactorizar message-processor para usar constantes
- [ ] Refactorizar appointment-manager para usar constantes

**Ejemplo de constantes:**
```typescript
// src/lib/constants/checkpoints.ts
export const CHECKPOINTS = {
  precio: { name: 'Precio', points: 15 },
  ubicacion: { name: 'Ubicación', points: 15 },
  modelo: { name: 'Modelo', points: 15 },
  creditos: { name: 'Créditos', points: 15 },
  seguridad: { name: 'Seguridad', points: 15 },
  brochure: { name: 'Brochure', points: 15 }
} as const;

export type CheckpointKey = keyof typeof CHECKPOINTS;
```

---

## **FASE 2: Seguridad y Autenticación**
**Duración estimada:** 3-4 días  
**Prioridad:** Crítica  
**Objetivo:** Preparar sistema para múltiples usuarios administrativos

### 2.1 Implementar Row Level Security (RLS) ✅ **COMPLETADO - 5 nov 2025**

**Problema actual:**
- Base de datos sin políticas de seguridad
- Cualquier cliente con `anon_key` puede leer/modificar todo

**Solución:**

**Migración 008: RLS y Roles**

```sql
-- supabase/migrations/008_rls_and_roles.sql

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

-- Service role siempre puede todo (para webhook)
CREATE POLICY "Service role can manage advisor requests"
  ON advisor_requests FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Aplicar RLS a tablas restantes (solo lectura para admins)
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE intents_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;

-- Políticas genéricas de lectura para tablas de solo consulta
CREATE POLICY "Admin users can view user sessions"
  ON user_sessions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid() AND admin_users.is_active = true));

CREATE POLICY "Admin users can view user progress"
  ON user_progress FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid() AND admin_users.is_active = true));

CREATE POLICY "Admin users can view intents log"
  ON intents_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid() AND admin_users.is_active = true));

-- Service role tiene acceso total a todo
CREATE POLICY "Service role full access user_sessions" ON user_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access user_progress" ON user_progress FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access intents_log" ON intents_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access followups" ON scheduled_followups FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access resources" ON resources FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================
-- FUNCIÓN PARA VERIFICAR PERMISOS
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
```

**Tareas:**
- [x] Crear migración 008 con RLS completo
- [x] Aplicar migración a BD de desarrollo
- [x] Crear usuario super_admin de prueba
- [x] Testing: Verificar políticas (script test-auth-system.ts)
- [ ] Aplicar a producción (pendiente)

**✅ COMPLETADO - 5 nov 2025**

---

### 2.2 Sistema de Autenticación ✅ **COMPLETADO - 5 nov 2025**

**Estructura:**
```
src/app/(auth)/
├── login/
│   └── page.tsx             # Página de login con Supabase Auth
├── layout.tsx               # Layout sin sidebar
└── middleware.ts            # Proteger rutas (opcional, usar middleware global)
```

**Tareas:**
- [x] Crear layout de autenticación
- [x] Crear página de login con Supabase Auth
- [x] Implementar middleware para proteger rutas del dashboard
- [x] Crear hook `useAuth()` para obtener usuario actual
- [x] Integrar logout en layout del dashboard
- [x] Testing completo del sistema de auth

**Archivos creados:**
- `src/app/(auth)/login/page.tsx` ✅
- `src/app/(auth)/layout.tsx` ✅
- `src/hooks/use-auth.ts` ✅
- `middleware.ts` (raíz del proyecto) ✅
- `scripts/test-auth-system.ts` ✅

**Credenciales de prueba:**
- Email: admin@europa.com
- Password: europa2025
- Rol: super_admin

**✅ COMPLETADO - 5 nov 2025**

---

## **FASE 3: Refactorización Core (Sin Romper Nada)**
**Duración estimada:** 5-6 días  
**Prioridad:** Alta  
**Objetivo:** Panel de control para gestionar bot, conversaciones y usuarios

### 3.1 Estructura de Carpetas

```
src/app/(dashboard)/
├── layout.tsx                      # Layout con sidebar y header
├── page.tsx                        # Dashboard principal (métricas)
├── conversations/
│   ├── page.tsx                    # Lista de conversaciones
│   └── [userId]/
│       └── page.tsx                # Detalle de conversación
├── appointments/                   # YA EXISTE
│   └── page.tsx                    # (mejorar UI)
├── advisor-requests/
│   └── page.tsx                    # Solicitudes pendientes
├── intents/
│   ├── page.tsx                    # Lista de intenciones
│   └── [intentId]/
│       └── page.tsx                # Editor de intención
├── messages/
│   ├── page.tsx                    # Lista de respuestas del bot
│   └── [intentName]/
│       └── page.tsx                # Editor de respuestas por intent
├── users/                          # Gestión de admins
│   ├── page.tsx                    # Lista de usuarios admin
│   └── [userId]/
│       └── page.tsx                # Editar usuario
├── analytics/
│   └── page.tsx                    # Métricas y gráficas
└── settings/
    └── page.tsx                    # Configuración general
```

---

### 3.2 Componentes Reutilizables

```
src/components/
├── ui/                              # Shadcn UI (ya instalado)
│   ├── button.tsx
│   ├── card.tsx
│   ├── table.tsx
│   ├── dialog.tsx
│   └── ... (instalar según necesidad)
│
├── layout/
│   ├── sidebar.tsx                 # Menú lateral
│   ├── header.tsx                  # Header con usuario
│   └── breadcrumb.tsx              # Navegación
│
├── conversations/
│   ├── conversation-list.tsx       # Lista de conversaciones
│   ├── conversation-card.tsx       # Card individual
│   ├── message-thread.tsx          # Thread de mensajes
│   └── user-info-panel.tsx         # Panel lateral con info
│
├── analytics/
│   ├── metrics-card.tsx            # Card de métrica (ej: "45 usuarios")
│   ├── lead-score-chart.tsx        # Gráfico de leads
│   └── intent-distribution.tsx     # Gráfico de intenciones más usadas
│
├── appointments/
│   ├── appointment-card.tsx        # Card de cita
│   └── calendar-view.tsx           # Vista de calendario
│
└── forms/
    ├── intent-editor.tsx           # Editor de intención (keywords, etc)
    ├── message-editor.tsx          # Editor WYSIWYG de mensajes
    └── user-form.tsx               # Formulario de usuario admin
```

**Componentes prioritarios a instalar de Shadcn:**
```bash
npx shadcn-ui@latest add button
npx shadcn-ui@latest add card
npx shadcn-ui@latest add table
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add input
npx shadcn-ui@latest add textarea
npx shadcn-ui@latest add select
npx shadcn-ui@latest add badge
npx shadcn-ui@latest add avatar
npx shadcn-ui@latest add dropdown-menu
npx shadcn-ui@latest add tabs
npx shadcn-ui@latest add toast
```

---

### 3.3 Custom Hooks

```
src/hooks/
├── use-auth.ts                     # Hook de autenticación
├── use-conversations.ts            # Fetch conversaciones con filtros
├── use-realtime.ts                 # Supabase Realtime subscriptions
├── use-analytics.ts                # Métricas calculadas
├── use-appointments.ts             # Gestión de citas
└── use-intents.ts                  # CRUD de intenciones
```

**Ejemplo: `use-conversations.ts`**
```typescript
// src/hooks/use-conversations.ts
export function useConversations(filters?: {
  startDate?: Date;
  endDate?: Date;
  leadStatus?: string;
  hasAppointment?: boolean;
}) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchConversations() {
      // Query a Supabase con filtros
      // ...
    }
    fetchConversations();
  }, [filters]);

  return { conversations, loading };
}
```

---

### 3.4 Editor de Intenciones y Mensajes

**Funcionalidad clave:**
Permitir editar desde el dashboard:
- Keywords, synonyms, typos de cada intent
- Mensajes de respuesta del bot
- Activar/desactivar intenciones
- Configurar prioridad

**Página: `/intents/[intentId]`**

**Formulario:**
```typescript
// src/components/forms/intent-editor.tsx
- Input: Display Name
- Textarea: Keywords (separados por coma)
- Textarea: Synonyms
- Textarea: Typos
- Textarea: Phrases
- Slider: Min Confidence (0.75 - 1.0)
- Switch: Is Active
- Switch: Is Checkpoint
- Button: Guardar
```

**Página: `/messages/[intentName]`**

**Lista de mensajes + Editor:**
```typescript
// src/components/forms/message-editor.tsx
- Select: Intent (dropdown)
- Input: Response Key (ej: "main_response")
- Textarea: Message Text (preview en tiempo real)
- Input: Media URL (opcional)
- Number: Order Priority
- Switch: Is Active
- Button: Agregar Mensaje
- Lista de mensajes existentes (editar/eliminar)
```

**Repository a crear:**
```typescript
// src/data/repositories/intent-config.repository.ts
export class IntentConfigRepository {
  async getAll(): Promise<IntentConfiguration[]>
  async getByName(name: string): Promise<IntentConfiguration | null>
  async update(id: string, data: Partial<IntentConfiguration>): Promise<void>
  async getResponsesByIntent(intentName: string): Promise<BotResponse[]>
  async updateResponse(id: string, data: Partial<BotResponse>): Promise<void>
  async createResponse(data: BotResponseData): Promise<BotResponse>
  async deleteResponse(id: string): Promise<void>
}
```

---

### 3.5 Dashboard Principal (Métricas)

**Página: `/dashboard/page.tsx`**

**Secciones:**

1. **Cards de Métricas**
   - Total de usuarios
   - Conversaciones hoy
   - Citas agendadas (pendientes)
   - Leads HOT (score > 70)

2. **Gráfico: Conversaciones por día** (últimos 7 días)

3. **Gráfico: Distribución de intenciones** (pie chart)

4. **Tabla: Últimas conversaciones** (10 más recientes)

5. **Tabla: Citas próximas** (próximas 5)

6. **Tabla: Solicitudes de asesor pendientes**

**Queries necesarias:**
```typescript
// src/hooks/use-analytics.ts
- getTotalUsers()
- getConversationsToday()
- getPendingAppointments()
- getHotLeads()
- getConversationsByDay(days: 7)
- getIntentDistribution()
- getRecentConversations(limit: 10)
- getUpcomingAppointments(limit: 5)
- getPendingAdvisorRequests()
```

---

## **FASE 4: Notificaciones y Servicios**
**Duración estimada:** 2-3 días  
**Prioridad:** Media-Alta  
**Objetivo:** Completar servicios de comunicación

### 4.1 Servicio de Notificación al Asesor

**Problema actual:**
```typescript
// ❌ ACTUAL: message-processor.ts línea 341
console.log('📧 Notificar al agente sobre derivación:', {...});
```

**Solución:**
```
src/services/whatsapp/
├── notification.service.ts         # Envío de notificaciones a asesores
└── index.ts
```

**Implementación:**
```typescript
// src/services/whatsapp/notification.service.ts
export class WhatsAppNotificationService {
  /**
   * Notificar al asesor sobre nueva derivación
   */
  async notifyAdvisorRequest(
    advisorPhone: string,
    user: User,
    request: AdvisorRequest
  ): Promise<void> {
    const message = 
      `🆘 *NUEVA DERIVACIÓN A ASESOR*\n\n` +
      `👤 Usuario: ${user.name || 'Sin nombre'}\n` +
      `📱 Teléfono: ${user.phone_number}\n` +
      `📊 Lead Score: ${user.lead_score} (${user.lead_status})\n` +
      `✅ Checkpoints: ${request.checkpoints_completed}/6\n` +
      `❌ Fallbacks: ${request.fallback_count}\n\n` +
      `💬 Último mensaje:\n"${request.last_user_message}"\n\n` +
      `🔗 Ver detalles: ${process.env.NEXT_PUBLIC_APP_URL}/dashboard/advisor-requests/${request.id}`;

    await this.sendMessage(advisorPhone, message);
  }

  /**
   * Notificar recordatorio de cita (próximamente)
   */
  async notifyAppointmentReminder(
    userPhone: string,
    appointment: Appointment
  ): Promise<void> {
    // Implementar
  }

  private async sendMessage(phone: string, text: string): Promise<void> {
    // Usar whatsappClient existente
  }
}
```

**Tareas:**
- [ ] Crear `notification.service.ts`
- [ ] Integrar en `message-processor.ts` (reemplazar console.log)
- [ ] Testing con número de prueba
- [ ] Configurar número de asesor en BD

---

### 4.2 Servicio de Storage (Opcional)

**Para manejar PDFs, brochures, videos:**

```
src/services/storage/
├── resource-manager.ts             # Upload/download de recursos
└── index.ts
```

**Funcionalidad:**
- Upload de archivos a Supabase Storage
- Generar URLs públicas
- Asociar recursos con intenciones
- Enviar archivos en respuestas del bot

**Tareas (Fase futura):**
- [ ] Crear service de storage
- [ ] Crear bucket en Supabase
- [ ] UI para subir archivos en dashboard
- [ ] Modificar bot para enviar archivos según intent

---

## **FASE 5: Testing y Deployment**
**Duración estimada:** 2 días  
**Prioridad:** Alta  
**Objetivo:** Preparar para producción

### 5.1 Testing Completo

**Testing manual:**
- [ ] Flujo completo de conversación (6 intenciones)
- [ ] Sistema de citas (auto-offer, fecha, hora, confirmación)
- [ ] Derivación a asesor (3 fallbacks, captura nombre, notificación)
- [ ] Dashboard de conversaciones (filtros, búsqueda)
- [ ] Editor de intenciones (modificar keywords, guardar)
- [ ] Editor de mensajes (crear, editar, eliminar)
- [ ] Login/logout (roles diferentes)
- [ ] RLS (verificar que viewer no puede editar)

**Testing de seguridad:**
- [ ] RLS: Usuario sin auth no puede acceder a datos
- [ ] RLS: Viewer no puede modificar intenciones
- [ ] RLS: Agent puede ver pero no editar configs
- [ ] RLS: Admin puede editar mensajes pero no usuarios
- [ ] RLS: Super Admin puede todo

---

### 5.2 Variables de Entorno

**Archivo: `.env.production`**
```bash
# Supabase Production
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto-prod.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...prod...
SUPABASE_SERVICE_ROLE_KEY=eyJ...prod...

# WhatsApp Production
WHATSAPP_API_TOKEN=EAB5uTpj...
WHATSAPP_PHONE_NUMBER_ID=458574770662643
WHATSAPP_BUSINESS_ACCOUNT_ID=426465080551599
WHATSAPP_WEBHOOK_VERIFY_TOKEN=europa_bot_verify_2025_secure

# App Config
NEXT_PUBLIC_APP_URL=https://europabot.com
NODE_ENV=production
CRON_SECRET=random-secret-string-here
```

---

### 5.3 Deployment a Vercel

**Pasos:**
```bash
# 1. Vincular proyecto con Vercel
vercel link

# 2. Configurar variables de entorno en Vercel Dashboard
# (copiar desde .env.production)

# 3. Deploy
vercel --prod
```

**Verificaciones post-deploy:**
- [ ] Webhook funcionando (test con mensaje real)
- [ ] Dashboard accesible con login
- [ ] RLS funcionando en producción
- [ ] Notificaciones llegando a asesor
- [ ] No hay errores en logs de Vercel

---

## **FASE 6: Mejoras Futuras (Post-MVP)**
**Prioridad:** Baja (después de producción)

### 6.1 Analytics Avanzado
- Gráficos de conversión (lead → cita → venta)
- Tiempo promedio de respuesta del bot
- Intenciones más fallidas
- Usuarios más activos

### 6.2 Sistema de Follow-ups Automático
- Implementar tabla `scheduled_followups` (ya existe en schema)
- Cron job para enviar mensajes programados
- Recordatorios de citas 24h antes

### 6.3 Control Manual de Conversaciones
- Botón "Tomar control" para agente humano
- Pausar bot mientras agente responde
- Reanudar bot cuando agente termina

### 6.4 Multi-canal
- Webhook de Instagram
- Webhook de Telegram
- Unificar conversaciones en dashboard

### 6.5 AI Enhancements
- Usar OpenAI para respuestas más naturales (fallback inteligente)
- Análisis de sentimiento
- Resumen automático de conversaciones

---

## 📊 Resumen de Tareas por Prioridad (ACTUALIZADO)

### ⭐ Prioridad #1 - Flexibilidad del Sistema (Semana 1) ✅ **COMPLETADO**
1. **Sistema de Configuración Dinámica** (Fase 0) - 1 día ✅
   - Umbral de citas configurable
   - Puntos de scoring configurables
   - Configuración desde dashboard
   
2. **Editor de Intenciones** (Fase 1) - 2 días ✅
   - Agregar/editar intenciones sin código
   - Marcar checkpoints dinámicamente
   - Gestionar respuestas del bot

**Justificación:** El cliente necesita flexibilidad para agregar/cambiar intenciones y ajustar cuántos checkpoints requiere antes de ofrecer cita. Esto debe ser prioritario antes que seguridad porque afecta directamente la operación del bot.

---

### 🔒 Prioridad #2 - Seguridad (Semana 2) ✅ **COMPLETADO**
3. **RLS y Seguridad** (Fase 2.1) - 1 día ✅
   - Base de datos con RLS completo
   - Roles de usuario (super_admin, admin, agent, viewer)
   - Tabla admin_users creada
   
4. **Sistema de Autenticación** (Fase 2.2) - 1 día ✅
   - Dashboard protegido con middleware
   - Login con Supabase Auth
   - Hook useAuth() funcionando
   - Usuario super_admin creado
   
5. **Notificación al Asesor** (Fase 4.1) - 1 día ⏳ PENDIENTE
   - Completar flujo de derivación

**Justificación:** Una vez que el sistema es flexible, lo siguiente es asegurarlo para múltiples usuarios.

---

### � Prioridad #3 - Refactorización (Semana 3)
6. **Refactorizar Fallback** (Fase 2.1) - 1 día
   - Mejorar mantenibilidad
   
7. **Lead Scoring Automatizado** (Fase 2.2) - 1 día
   - Calcular automáticamente cold/warm/hot
   
8. **Dashboard Principal** (Fase 4.5) - 2 días
   - Métricas y gráficos

**Justificación:** Con el sistema flexible y seguro, ahora mejoramos la arquitectura interna.

---

### � Prioridad #4 - Dashboard Completo (Semana 4)
9. **Dashboard de Conversaciones** (Fase 4.1) - 2 días
10. **Componentes Reutilizables** (Fase 4.2) - 2 días
11. **Centralizar Constantes** (Fase 2.3) - 1 día

**Justificación:** Completar la experiencia administrativa.

---

### 🟢 Post-MVP (Semana 5+)
12. **Analytics Avanzado** (Fase 6.1)
13. **Follow-ups Automáticos** (Fase 6.2)
14. **Storage de Recursos** (Fase 5.2)
15. **Control Manual** (Fase 6.3)
16. **Multi-canal** (Fase 6.4)

---

## 📅 Timeline Estimado (ACTUALIZADO)

```
Semana 1 - Configuración y Flexibilidad:
├── Día 1: Sistema de Configuración Dinámica (Fase 0) ⭐
│   ├── Tabla bot_config
│   ├── ConfigRepository
│   └── Integrar en message-processor
├── Día 2-3: Editor de Intenciones (Fase 1) ⭐
│   ├── IntentConfigRepository
│   ├── Lista de intenciones
│   └── Formulario de edición
├── Día 4: Editor de Respuestas (Fase 1.4)
│   └── CRUD de respuestas por intención
└── Día 5: Testing y ajustes
    ├── Crear nueva intención desde dashboard
    └── Modificar umbral de citas y verificar

Semana 2 - Seguridad y Autenticación:
├── Día 1-2: RLS completo (Fase 3.1)
│   ├── Migración 008 con admin_users
│   └── Políticas por rol
├── Día 3-4: Sistema de Autenticación (Fase 3.2)
│   ├── Login page
│   ├── Middleware
│   └── useAuth hook
└── Día 5: Notificación al Asesor (Fase 5.1)
    └── WhatsAppNotificationService

Semana 3 - Refactorización:
├── Día 1: Extraer lógica de Fallback (Fase 2.1)
│   ├── FallbackHandler
│   └── Fallback messages
├── Día 2: Lead Scoring Automatizado (Fase 2.2)
│   └── LeadScorer integrado
├── Día 3-4: Dashboard Principal (Fase 4.5)
│   ├── Métricas
│   └── Gráficos
└── Día 5: Testing de seguridad
    └── Verificar RLS con diferentes roles

Semana 4 - Dashboard Completo:
├── Día 1-2: Dashboard de Conversaciones (Fase 4.1)
│   └── Vista de conversaciones con filtros
├── Día 3: Componentes Reutilizables (Fase 4.2)
│   └── Sidebar, Header, Cards
├── Día 4: Testing completo
│   └── Flujos end-to-end
└── Día 5: Deploy a producción
    └── Vercel + Verificaciones

Semana 5 (opcional) - Mejoras:
├── Centralizar constantes (Fase 2.3)
├── Storage de recursos (Fase 5.2)
└── Analytics avanzado (Fase 6.1)
```

**Total estimado: 4-5 semanas para MVP completo**

### Orden de Prioridades Confirmado:

1. ⭐ **FASE 0:** Sistema Configurable (1 día)
2. ⭐ **FASE 1:** Editor de Intenciones (2 días)
3. 🔒 **FASE 3:** RLS + Autenticación (3 días)
4. 📱 **FASE 5.1:** Notificación Asesor (1 día)
5. 🔧 **FASE 2:** Refactorización Core (2-3 días)
6. 📊 **FASE 4:** Dashboard Completo (5-6 días)

---

## 🎯 Criterios de Éxito

### MVP Listo para Producción (4 semanas):

**Semana 1 - Flexibilidad Completa:**
- ✅ Sistema de configuración dinámica funcionando
- ✅ Umbral de citas configurable desde dashboard
- ✅ Puntos de scoring configurables
- ✅ Editor de intenciones completo (CRUD)
- ✅ Editor de respuestas del bot
- ✅ Agregar nueva intención sin tocar código (verificado)
- ✅ Cambiar umbral y verificar comportamiento

**Semana 2 - Seguridad Implementada:**
- ✅ RLS implementado y probado
- ✅ 4 roles funcionando (super_admin, admin, agent, viewer)
- ✅ Sistema de autenticación con Supabase Auth
- ✅ Middleware protegiendo rutas del dashboard
- ✅ Notificación al asesor funcionando (WhatsApp)
- ✅ Testing de seguridad con diferentes roles

**Semana 3 - Arquitectura Mejorada:**
- ✅ Lógica de fallback extraída a módulo separado
- ✅ Lead scoring automatizado (cold/warm/hot)
- ✅ Dashboard principal con métricas básicas
- ✅ Gráficos de conversaciones e intenciones
- ✅ Testing completo de refactorización

**Semana 4 - Dashboard Completo:**
- ✅ Vista de conversaciones con filtros
- ✅ Componentes reutilizables (sidebar, header, cards)
- ✅ Testing end-to-end
- ✅ Deploy exitoso en Vercel
- ✅ Webhook WhatsApp funcionando en producción
- ✅ Documentación actualizada

### Post-MVP (Mejora continua):
- ⏳ Analytics avanzado (conversión, tiempos de respuesta)
- ⏳ Sistema de follow-ups automático
- ⏳ Control manual de conversaciones (agente toma control)
- ⏳ Multi-canal (Instagram, Telegram)
- ⏳ AI Enhancements (OpenAI para fallback inteligente)
- ⏳ Storage de recursos (PDFs, videos)

---

## 📝 Notas Finales

- Este plan está diseñado para ser **incremental**: cada fase es independiente y no rompe funcionalidad existente
- Prioriza **seguridad y estabilidad** antes que features nuevas
- Mantiene **arquitectura limpia** siguiendo principios de `AGENTS.md`
- Permite **desplegar a producción después de Fase 2** (con funcionalidad básica segura)
- Fases 3-4 pueden reordenarse según necesidades del negocio

---

**Última actualización:** 5 de noviembre de 2025  
**Estado del plan:** ✅ Aprobado - Listo para ejecución  
**Responsable:** Equipo de desarrollo

---

## 📝 Decisiones Clave del Cliente (Confirmadas)

### Sobre Intenciones:
- ✅ **Flexibilidad total:** Sistema debe permitir agregar/cambiar intenciones fácilmente
- ✅ **Checkpoints configurables:** Por defecto todas son checkpoints, pero poder desactivarlas
- ✅ **Respuestas editables:** Modificar mensajes del bot desde dashboard sin tocar código

### Sobre Umbral de Citas:
- ✅ **Configurable desde dashboard:** No hardcodear el número 4
- ✅ **Rango dinámico:** Desde 1 hasta el máximo de checkpoints disponibles
- ✅ **Ajustable en tiempo real:** Cambiar y verificar sin deploy

### Sobre Lead Scoring:
- ✅ **Puntos configurables si ya lo tenemos así:** Si es fácil, hacerlo configurable
- ✅ **Si no, dejar como está:** 15 puntos por checkpoint es aceptable
- ✅ **Prioridad en flexibilidad:** Mejor invertir tiempo en editor de intenciones

### Orden de Prioridades (Cliente aprobó):
1. ⭐ **Sistema Configurable + Editor de Intenciones** (más flexible)
2. 🔒 **RLS + Autenticación** (más seguro)
3. 📱 **Notificación al Asesor** (completar flujo actual)
4. 🔧 **Refactorización** (mejorar arquitectura)
5. 📊 **Dashboard Completo** (experiencia administrativa)

---

## 🚀 Próximo Paso: Comenzar Fase 0

**Tarea inmediata:** Crear migración 009 con tabla `bot_config`

**Comando:**
```bash
# Crear archivo de migración
touch supabase/migrations/009_bot_config_system.sql

# Copiar el SQL de la Fase 0.1 de este documento
```

**Verificación de éxito:**
- [ ] Migración aplicada sin errores
- [ ] Tabla bot_config con 12+ configuraciones insertadas
- [ ] Consultar: `SELECT * FROM bot_config ORDER BY category, config_key;`

---

**Última actualización:** 5 de noviembre de 2025  
**Estado del plan:** ✅ Aprobado - Iniciando ejecución  
**Responsable:** Equipo de desarrollo
