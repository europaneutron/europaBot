# Plan: Sistema de Derivación a Asesor Humano

## 📋 Objetivo
Implementar un flujo que derive usuarios a un asesor humano después de 3 fallbacks consecutivos, sin interferir con los flujos existentes (citas, checkpoints, intents).

---

## 🎯 Requisitos Funcionales

### Flujo Completo:
```
Fallback 3 → Preguntar nombre → Capturar nombre → Confirmar derivación → 
Notificar agente → Bot sigue activo para consultas básicas
```

### Mensaje Final:
```
"Gracias {nombre}. Un asesor se comunicará contigo vía WhatsApp 
en nuestro horario de atención (lunes a viernes 9:00 AM - 6:00 PM).

Mientras tanto, puedo ayudarte con:
• Precios y modelos disponibles
• Ubicación y amenidades
• Opciones de financiamiento
• Información general (brochure)

¿Hay algo en lo que pueda ayudarte ahora?"
```

---

## 🔍 Análisis de No-Interferencia

### ✅ Flujos Existentes que NO deben verse afectados:

1. **Flujo de Citas (Appointments)**
   - Estado: `appointment_flow_state` en `user_progress`
   - Estados: `pending_auto_offer`, `ask_date`, `ask_time`, `ask_name`, `completed`
   - ✅ **No interfiere**: Usa su propio campo de estado

2. **Checkpoints (Lead Scoring)**
   - Campos: `precio_completed`, `ubicacion_completed`, etc.
   - Sistema: Marca completados cuando detecta intents
   - ✅ **No interfiere**: Sistema de derivación no toca checkpoints

3. **Intent Detection**
   - Proceso: Mensaje → Normalización → Fuzzy matching → Respuesta
   - ✅ **No interfiere**: La captura de nombre usa un estado separado

4. **Fallback Existente**
   - Niveles: 1, 2, 3
   - Campo: `fallback_attempts` en `user_sessions`
   - ⚠️ **Requiere modificación**: Nivel 3 cambia comportamiento

---

## 🏗️ Arquitectura Propuesta

### 1. Nuevo Campo en `user_sessions`

```sql
-- Migración 007: Agregar estado de espera de nombre para derivación
ALTER TABLE user_sessions
ADD COLUMN awaiting_advisor_name BOOLEAN DEFAULT false;

COMMENT ON COLUMN user_sessions.awaiting_advisor_name IS 
'Usuario está en proceso de derivación y siguiente mensaje será su nombre';
```

**Razón**: 
- ✅ Separado de `appointment_flow_state` (no hay conflicto)
- ✅ Vive en `user_sessions` (estado temporal de conversación)
- ✅ Se resetea fácilmente después de capturar nombre

---

### 2. Nueva Tabla: `advisor_requests`

```sql
-- Migración 007: Tabla para tracking de derivaciones a asesor
CREATE TABLE advisor_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  -- Contexto de la solicitud
  request_reason VARCHAR(100) DEFAULT 'fallback_limit',
  last_user_message TEXT,
  fallback_count INTEGER,
  lead_score INTEGER,
  checkpoints_completed INTEGER,
  
  -- Estado de atención
  status VARCHAR(20) DEFAULT 'pending',
  assigned_to VARCHAR(100),
  contacted_at TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_advisor_requests_user ON advisor_requests(user_id);
CREATE INDEX idx_advisor_requests_status ON advisor_requests(status);
CREATE INDEX idx_advisor_requests_created ON advisor_requests(created_at DESC);

-- Constraint para status
ALTER TABLE advisor_requests
ADD CONSTRAINT advisor_requests_status_check 
CHECK (status IN ('pending', 'contacted', 'resolved', 'cancelled'));

-- Trigger de updated_at
CREATE TRIGGER update_advisor_requests_updated_at 
BEFORE UPDATE ON advisor_requests
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

**Razón**:
- ✅ Tabla independiente (no afecta otras tablas)
- ✅ Permite dashboard de solicitudes pendientes
- ✅ Historial de derivaciones
- ✅ Métricas de atención

---

### 3. Configuración en `agent_config`

```sql
-- Agregar campos a agent_config existente
ALTER TABLE agent_config
ADD COLUMN business_hours VARCHAR(100) DEFAULT 'lunes a viernes 9:00 AM - 6:00 PM',
ADD COLUMN advisor_phone VARCHAR(20),
ADD COLUMN advisor_email VARCHAR(100);

COMMENT ON COLUMN agent_config.business_hours IS 'Horario de atención para mostrar al usuario';
COMMENT ON COLUMN agent_config.advisor_phone IS 'Teléfono del asesor para notificaciones';
COMMENT ON COLUMN agent_config.advisor_email IS 'Email del asesor para notificaciones';
```

**Razón**:
- ✅ Reutiliza tabla existente de appointments
- ✅ Configurable desde BD
- ✅ No hardcodear horarios en código

---

## 🔄 Flujo de Estados (State Machine)

### Estado Normal:
```
awaiting_advisor_name = false
appointment_flow_state = null
→ Procesa mensajes normalmente
→ Intent detection funciona
```

### Estado de Derivación:
```
fallback_attempts = 3
→ Pregunta nombre
→ awaiting_advisor_name = true
→ appointment_flow_state = null (sin cambios)
```

### Captura de Nombre:
```
awaiting_advisor_name = true
→ Siguiente mensaje = nombre (sin intent detection)
→ Guardar en users.name
→ Crear advisor_request
→ awaiting_advisor_name = false
→ fallback_attempts = 0 (reset)
→ Confirmar + ofrecer ayuda
```

### Después de Derivación:
```
awaiting_advisor_name = false
fallback_attempts = 0
→ Bot funciona normalmente
→ Usuario puede hacer preguntas
→ Puede usar flujo de citas si quiere
```

---

## 🚦 Jerarquía de Verificación en `message-processor.ts`

```typescript
// Orden de verificación (SIN CAMBIOS en los primeros pasos):

1. ✅ Verificar bot activo (is_active)
   → Si inactivo: no responder

2. ✅ Verificar flujo de cita activo (appointment_flow_state)
   → Si activo: procesar con AppointmentManager
   → RETURN (no continuar)

3. ✅ Verificar auto-offer de cita (pending_auto_offer)
   → Si hay estado: detectar respuesta positiva
   → RETURN si acepta, o limpiar y continuar

4. 🆕 Verificar espera de nombre (awaiting_advisor_name) [NUEVO]
   → Si true: capturar nombre, crear request, confirmar
   → RETURN (no hacer intent detection)

5. ✅ Intent detection normal
   → Detectar intent con fuzzy matcher
   → Si no detecta: Fallback

6. ✅ Procesar fallback (niveles 1, 2, 3)
   → Nivel 3 modificado: pedir nombre y activar awaiting_advisor_name
```

**Razón del orden**:
- ✅ Citas tienen prioridad (ya iniciadas)
- ✅ Auto-offer de citas (4+ checkpoints)
- ✅ Derivación a asesor (nuevo)
- ✅ Intent detection normal

**No hay conflictos porque**:
- Cada estado es excluyente
- Se usa `RETURN` para evitar continuar
- Estados en diferentes campos

---

## 📝 Modificaciones Necesarias

### Archivo 1: `message-processor.ts`

**Ubicación de cambio**: Después de línea 113 (después de verificar auto-offer)

```typescript
// NUEVO: Paso 4 - Verificar si está esperando nombre para derivación
const session = await userRepository.getSession(user.id);

if (session?.awaiting_advisor_name) {
  // Capturar nombre del usuario
  const userName = messageText.trim();
  
  // Guardar nombre en users
  await userRepository.updateName(user.id, userName);
  
  // Obtener configuración de agente
  const agentConfig = await appointmentRepository.getDefaultAgent();
  
  // Crear solicitud de asesor
  const advisorRequest = await advisorRepository.create({
    user_id: user.id,
    request_reason: 'fallback_limit',
    last_user_message: messageText,
    fallback_count: session.fallback_attempts,
    lead_score: user.lead_score,
    checkpoints_completed: await userRepository.countCompletedCheckpoints(user.id)
  });
  
  // Resetear estado y fallback
  await userRepository.updateAwaitingAdvisorName(user.id, false);
  await userRepository.resetFallbackAttempts(user.id);
  
  // Notificar al agente
  await notifyAdvisor(user, advisorRequest, agentConfig);
  
  // Mensaje de confirmación
  const confirmationMessage = 
    `Gracias ${userName}. Un asesor se comunicará contigo vía WhatsApp ${agentConfig.business_hours}.\n\n` +
    'Mientras tanto, puedo ayudarte con:\n' +
    '• Precios y modelos disponibles\n' +
    '• Ubicación y amenidades\n' +
    '• Opciones de financiamiento\n' +
    '• Información general (brochure)\n\n' +
    '¿Hay algo en lo que pueda ayudarte ahora?';
  
  return {
    responses: [confirmationMessage],
    shouldSend: true,
    wasDetected: true,
    isFallback: false
  };
}

// Continuar con intent detection normal...
```

**Ubicación de cambio 2**: Fallback nivel 3 (línea ~268)

```typescript
case 3:
  // Nivel 3: Pedir nombre para derivar a asesor
  fallbackMessage =
    'Veo que necesitas información más específica.\n\n' +
    '👨‍💼 Te voy a conectar con uno de nuestros asesores para que te ayude personalmente.\n\n' +
    '¿Cuál es tu nombre completo?';
  
  // Activar estado de espera de nombre
  await userRepository.updateAwaitingAdvisorName(userId, true);
  
  // NO desactivar el bot (is_active sigue true)
  break;
```

---

### Archivo 2: `user.repository.ts`

**Nuevos métodos**:

```typescript
/**
 * Activar/desactivar estado de espera de nombre para derivación
 */
async updateAwaitingAdvisorName(userId: string, awaiting: boolean): Promise<void> {
  await supabaseServer
    .from('user_sessions')
    .update({ awaiting_advisor_name: awaiting })
    .eq('user_id', userId);
}

/**
 * Actualizar nombre del usuario
 */
async updateName(userId: string, name: string): Promise<void> {
  await supabaseServer
    .from('users')
    .update({ name })
    .eq('id', userId);
}
```

---

### Archivo 3: NUEVO `advisor.repository.ts`

```typescript
/**
 * Repositorio para solicitudes de asesor
 */

import { supabaseServer } from '@/services/supabase/server-client';

export interface AdvisorRequestData {
  user_id: string;
  request_reason: string;
  last_user_message: string;
  fallback_count: number;
  lead_score: number;
  checkpoints_completed: number;
}

export class AdvisorRepository {
  /**
   * Crear nueva solicitud de asesor
   */
  async create(data: AdvisorRequestData): Promise<any> {
    const { data: request, error } = await supabaseServer
      .from('advisor_requests')
      .insert({
        user_id: data.user_id,
        request_reason: data.request_reason,
        last_user_message: data.last_user_message,
        fallback_count: data.fallback_count,
        lead_score: data.lead_score,
        checkpoints_completed: data.checkpoints_completed,
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating advisor request:', error);
      throw error;
    }

    return request;
  }

  /**
   * Obtener solicitudes pendientes
   */
  async getPending(): Promise<any[]> {
    const { data, error } = await supabaseServer
      .from('advisor_requests')
      .select(`
        *,
        user:users (
          phone_number,
          name,
          lead_score,
          lead_status
        )
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching pending requests:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Marcar como contactado
   */
  async markContacted(requestId: string, assignedTo: string): Promise<void> {
    await supabaseServer
      .from('advisor_requests')
      .update({
        status: 'contacted',
        assigned_to: assignedTo,
        contacted_at: new Date().toISOString()
      })
      .eq('id', requestId);
  }
}

export const advisorRepository = new AdvisorRepository();
```

---

## 🔔 Sistema de Notificación

### Función auxiliar en `message-processor.ts`:

```typescript
/**
 * Notificar al agente sobre nueva derivación
 */
async function notifyAdvisor(
  user: any,
  request: any,
  agentConfig: any
): Promise<void> {
  const message = 
    `🆘 *NUEVA DERIVACIÓN A ASESOR*\n\n` +
    `👤 Usuario: ${user.name || 'Sin nombre'}\n` +
    `📱 Teléfono: ${user.phone_number}\n` +
    `📊 Lead Score: ${user.lead_score} (${user.lead_status})\n` +
    `✅ Checkpoints: ${request.checkpoints_completed}/6\n` +
    `❌ Fallbacks: ${request.fallback_count}\n\n` +
    `💬 Último mensaje:\n"${request.last_user_message}"\n\n` +
    `🔗 Ver detalles: [URL_DASHBOARD]/advisor-requests/${request.id}`;

  // Enviar por WhatsApp si está configurado
  if (agentConfig.advisor_phone) {
    await whatsappService.sendMessage(agentConfig.advisor_phone, message);
  }

  // TODO: Enviar email si está configurado
  // if (agentConfig.advisor_email) {
  //   await emailService.send(...);
  // }
}
```

---

## 📊 Dashboard Opcional (Futuro)

### Página: `/advisor-requests`

Mostrar:
- Lista de solicitudes pendientes
- Información del usuario (nombre, teléfono, lead score)
- Contexto de conversación
- Botón para marcar como "contactado"
- Filtros por estado

---

## ✅ Checklist de Implementación

### Fase 1: Base de Datos
- [ ] Crear migración 007 con:
  - [ ] Campo `awaiting_advisor_name` en `user_sessions`
  - [ ] Tabla `advisor_requests` completa
  - [ ] Campos adicionales en `agent_config`
- [ ] Aplicar migración con `npx supabase db push`
- [ ] Verificar en Supabase Studio

### Fase 2: Repositorios
- [ ] Crear `src/data/repositories/advisor.repository.ts`
- [ ] Agregar métodos en `user.repository.ts`:
  - [ ] `updateAwaitingAdvisorName()`
  - [ ] `updateName()`
- [ ] Crear tipos en `src/types/advisor.types.ts`

### Fase 3: Lógica de Negocio
- [ ] Modificar `message-processor.ts`:
  - [ ] Agregar paso 4 (verificar awaiting_advisor_name)
  - [ ] Modificar fallback nivel 3
  - [ ] Agregar función `notifyAdvisor()`
- [ ] Testing del flujo completo

### Fase 4: Configuración
- [ ] Insertar configuración inicial en `agent_config`:
  ```sql
  UPDATE agent_config SET
    business_hours = 'lunes a viernes 9:00 AM - 6:00 PM',
    advisor_phone = '+52XXXXXXXXXX',
    advisor_email = 'ventas@europa.com';
  ```

### Fase 5: Testing
- [ ] Probar flujo de 3 fallbacks
- [ ] Verificar captura de nombre
- [ ] Confirmar notificación al agente
- [ ] Verificar que bot sigue activo después
- [ ] Probar que flujo de citas no se afecta

---

## 🔍 Casos de Prueba

### Test 1: Derivación básica
```
Usuario: "asdfasdf" (x3)
Bot: "Te voy a conectar... ¿Cuál es tu nombre?"
Usuario: "Leonardo Gordillo"
Bot: "Gracias Leonardo. Un asesor se comunicará..."
Usuario: "Cuanto cuesta?" 
Bot: [Responde con info de precios - bot activo]
```

### Test 2: No interferencia con citas
```
Usuario: Completa 4 checkpoints
Bot: Ofrece cita automáticamente
Usuario: "si"
Bot: Inicia flujo de cita (ask_date)
Usuario: "asdf" (respuesta inválida)
Bot: Pide fecha de nuevo (NO cuenta como fallback)
```

### Test 3: Usuario en flujo de cita + fallback externo
```
Usuario: En flujo de cita (awaiting_advisor_name = false)
Usuario en otra conversación: 3 fallbacks
Bot: Maneja ambos estados independientemente
```

---

## 📈 Métricas a Trackear

- Cantidad de derivaciones por día/semana/mes
- Lead score promedio de usuarios derivados
- Checkpoints completados antes de derivación
- Tiempo de respuesta del agente
- Tasa de conversión de usuarios derivados

---

## 🚀 Próximos Pasos

1. Revisar y aprobar este plan
2. Crear rama `feature/advisor-derivation`
3. Implementar Fase 1 (migraciones)
4. Testing incremental
5. Deploy a producción

---

**Última actualización**: 23 de octubre de 2025
**Estado**: Pendiente de aprobación
**Estimación**: 4-6 horas de desarrollo + testing
