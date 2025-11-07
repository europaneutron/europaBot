# Plan de Mejoras UX y Follow-up

**Fecha:** 7 de noviembre de 2025  
**Estado:** En planificación  
**Objetivo:** Mejorar experiencia de usuario del dashboard y agregar sistema de follow-up automático

---

## 📋 Tareas Priorizadas

### 1. Sidebar Minimalista con Iconos (2-3 horas)
**Prioridad:** Alta  
**Objetivo:** Navegación clara y compacta que no ocupe mucho espacio

#### Especificaciones:
- **Ancho:** 60-70px (solo iconos)
- **Tooltips:** Mostrar nombre al hacer hover
- **Indicador activo:** Resaltar página actual con color/background
- **Responsive mobile:** Bottom navigation bar (modo app)

#### Enlaces requeridos:
1. 🏠 Dashboard (`/dashboard`)
2. 💬 Conversaciones (`/conversations`)
3. 📋 Solicitudes Asesor (`/advisor-requests`)
4. 🎯 Intenciones (`/intents`)
5. 📅 Citas (`/appointments`)
6. ⚙️ Configuración (`/settings`)
7. 🚪 Cerrar Sesión (action)

#### Archivos a crear:
- `src/components/layout/sidebar.tsx`
- `src/components/layout/mobile-nav.tsx` (opcional)

#### Archivos a modificar:
- `src/app/(dashboard)/layout.tsx` - Integrar sidebar

#### Componentes de shadcn a instalar:
```bash
npx shadcn-ui@latest add tooltip
npx shadcn-ui@latest add separator
```

---

### 2. Página de Solicitudes de Asesor (3-4 horas)
**Prioridad:** Alta  
**Objetivo:** Visualización histórica de solicitudes, sin administración compleja

#### Especificaciones:
- **Solo lectura avanzada:** Ver todas las solicitudes históricas
- **Datos mostrados:**
  - Nombre del usuario
  - Teléfono
  - Fecha y hora de solicitud
  - Checkpoints completados al momento de solicitar
  - Lead status y score
  - Estado: Contactado / Pendiente (toggle simple)
- **Exportar CSV:** Botón para descargar toda la lista
- **Filtros básicos:**
  - Por estado (contactado/pendiente)
  - Por rango de fechas
  - Búsqueda por nombre/teléfono

#### Archivos a crear:
- `src/app/(dashboard)/advisor-requests/page.tsx`
- `src/hooks/use-advisor-requests.ts`
- `src/lib/utils/export-csv.ts`

#### Campos del CSV:
```
nombre,telefono,fecha_solicitud,checkpoints_completados,lead_status,lead_score,estado_contacto,ultimo_mensaje
```

#### Nota importante:
**NO crear panel de administración complejo.** Solo visualización y toggle de estado.  
El seguimiento real se hace por WhatsApp directamente con el asesor.

---

### 3. Exportar Conversaciones a CSV (1-2 horas)
**Prioridad:** Media  
**Objetivo:** Permitir exportar base de datos de clientes desde /conversations

#### Especificaciones:
- **Botón:** "Exportar a CSV" en página de conversaciones
- **Respeta filtros:** Solo exporta conversaciones visibles según filtros aplicados
- **Datos del CSV:**
  - Nombre
  - Teléfono
  - Lead Status
  - Lead Score
  - Checkpoints completados
  - Última interacción (fecha)
  - Tiene cita agendada (Sí/No)
  - Fecha de cita (si aplica)
  - Último mensaje

#### Archivos a modificar:
- `src/app/(dashboard)/conversations/page.tsx` - Agregar botón
- `src/lib/utils/export-csv.ts` - Reutilizar función

---

### 4. Sistema de Follow-up Automático (1 día completo)
**Prioridad:** Alta  
**Objetivo:** Reactivar conversaciones abandonadas con mensaje plantilla

#### Flujo del sistema:

**Condiciones para enviar follow-up:**
1. Usuario solicitó contacto con asesor (`advisor_requests` creado)
2. **NO** agendó cita después de la solicitud
3. Usuario no ha recibido follow-up para esta solicitud
4. Mensaje programado para ventana 9am-6pm del día siguiente (o mismo día si aplica)

**Algoritmo de programación inteligente:**
```
Si solicitud_hora es 7:00am → Programar para 9:00am día siguiente (fuera de 24h pero mínimo necesario)
Si solicitud_hora es 9:00am → Programar para 9:00am día siguiente (24h exactas)
Si solicitud_hora es 12:00pm → Programar para 12:00pm día siguiente (24h exactas)
Si solicitud_hora es 5:00pm → Programar para 5:00pm día siguiente (24h exactas)
Si solicitud_hora es 7:00pm → Programar para 9:00am día siguiente (primer horario disponible)

REGLA: Enviar lo antes posible dentro de ventana 9am-6pm, respetando las 24h cuando sea posible
```

**Mensaje plantilla (configurable en bot_config):**
```
Hola {nombre}! 👋

Noté que tenías interés en conocer más sobre nuestras casas en Fraccionamiento Europa.

¿Aún tienes alguna duda? Puedo ayudarte con:
• Información sobre precios y planes de pago
• Agendar una visita para ver las casas muestra
• Resolver cualquier pregunta que tengas

¿Te gustaría que platiquemos? 😊
```

**Nota:** La plantilla soporta variables: `{nombre}`, `{telefono}`. En MVP está hardcodeada pero configurable desde `bot_config`.

---

#### Componentes del sistema:

##### A) Migración de Base de Datos (30 min)
```sql
-- Nueva tabla: scheduled_followups
CREATE TABLE scheduled_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  advisor_request_id UUID REFERENCES advisor_requests(id),
  
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE,
  
  status VARCHAR(20) DEFAULT 'pending',
  message_template_key VARCHAR(50),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_followups_scheduled ON scheduled_followups(scheduled_for, status);
CREATE INDEX idx_followups_user ON scheduled_followups(user_id);
```

##### B) Configuración (15 min)
Agregar a `bot_config` tabla:
```sql
INSERT INTO bot_config (config_key, config_value, config_type, description, category, is_editable) VALUES
('followup_enabled', 'true', 'boolean', 'Activar sistema de follow-up automático', 'followup', true),
('followup_window_start', '09:00', 'string', 'Hora inicio ventana de envío (formato HH:mm)', 'followup', true),
('followup_window_end', '18:00', 'string', 'Hora fin ventana de envío (formato HH:mm)', 'followup', true),
('followup_template', 'Hola {nombre}! 👋\n\nNoté que tenías interés en conocer más sobre nuestras casas en Fraccionamiento Europa.\n\n¿Aún tienes alguna duda? Puedo ayudarte con:\n• Información sobre precios y planes de pago\n• Agendar una visita para ver las casas muestra\n• Resolver cualquier pregunta que tengas\n\n¿Te gustaría que platiquemos? 😊', 'string', 'Plantilla del mensaje de follow-up (soporta {nombre}, {telefono})', 'followup', true);
```

**Variables soportadas en plantilla:**
- `{nombre}` → Nombre del usuario (o "Hola!" si no tiene)
- `{telefono}` → Teléfono del usuario

##### C) Servicio de Follow-up (2-3 horas)

**Estructura siguiendo patrón del proyecto:**
```
src/core/followup/              # Lógica de negocio (ya existe carpeta)
├── followup-scheduler.ts       # NUEVO: Detecta y programa follow-ups
└── followup-sender.ts          # NUEVO: Envía mensajes programados

src/data/repositories/
└── followup.repository.ts      # NUEVO: Acceso a scheduled_followups
```

**Archivos a crear:**

1. **`src/core/followup/followup-scheduler.ts`**
   - Método: `scheduleForAbandonedRequests()` - Detecta usuarios sin cita
   - Método: `calculateNextAvailableSlot(requestTime)` - Algoritmo inteligente de horarios
   - Integra con `configRepository` para ventana horaria
   
2. **`src/core/followup/followup-sender.ts`**
   - Método: `sendPendingMessages()` - Envía mensajes pendientes
   - Valida hora actual dentro de ventana (9am-6pm)
   - Marca como enviados y registra en conversations
   - Usa `whatsappSender` para envío real

3. **`src/data/repositories/followup.repository.ts`**
   - Método: `createScheduledFollowup()`
   - Método: `getPendingFollowups()`
   - Método: `markAsSent()`
   - Método: `hasFollowupForRequest()`

##### D) API Endpoints (1 hora)
```
src/app/api/cron/
├── schedule-followups/
│   └── route.ts          # Cron: detecta y programa follow-ups (1x al día)
└── send-followups/
    └── route.ts          # Cron: envía mensajes pendientes (cada 30 min en ventana)
```

**Endpoints protegidos con:**
```typescript
// Validar CRON_SECRET en headers
const cronSecret = request.headers.get('authorization');
if (cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

##### E) Configuración Vercel Cron (15 min)
```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/schedule-followups",
      "schedule": "0 8 * * *"  // Diario a las 8am (detecta solicitudes del día anterior)
    },
    {
      "path": "/api/cron/send-followups",
      "schedule": "*/30 9-18 * * *"  // Cada 30 min de 9am a 6pm
    }
  ]
}
```

**Nota:** El cron de envío se ejecuta cada 30 minutos dentro de la ventana 9am-6pm para enviar mensajes programados lo antes posible.

---

#### Testing del sistema de follow-up:

**Prueba manual:**
1. Crear solicitud de asesor manualmente en BD
2. No agendar cita
3. Ejecutar `/api/cron/schedule-followups` manualmente
4. Verificar que se creó registro en `scheduled_followups`
5. Ejecutar `/api/cron/send-followups` manualmente (dentro de horario)
6. Verificar que mensaje llegó por WhatsApp

**Casos de prueba:**
- ✅ Solicitud 7:00am → Follow-up programado 9:00am día siguiente
- ✅ Solicitud 9:00am → Follow-up programado 9:00am día siguiente (24h)
- ✅ Solicitud 12:00pm → Follow-up programado 12:00pm día siguiente (24h)
- ✅ Solicitud 7:00pm → Follow-up programado 9:00am día siguiente (primera ventana)
- ✅ Usuario con solicitud + sin cita → debe programar follow-up
- ✅ Usuario con solicitud + con cita → NO debe programar
- ✅ Mensaje programado para 10am, ejecutar cron a 9:30am → NO enviar aún
- ✅ Mensaje programado para 10am, ejecutar cron a 10:00am → SÍ enviar
- ✅ Usuario ya tiene follow-up programado → NO duplicar

---

## 📐 Algoritmo de Programación Detallado

```typescript
function calculateNextAvailableSlot(requestCreatedAt: Date): Date {
  const WINDOW_START = 9;  // 9am
  const WINDOW_END = 18;   // 6pm
  
  const requestHour = requestCreatedAt.getHours();
  let scheduledDate = new Date(requestCreatedAt);
  scheduledDate.setDate(scheduledDate.getDate() + 1); // Día siguiente
  
  // Si solicitud fue entre 9am-6pm → mismo horario día siguiente (24h exactas)
  if (requestHour >= WINDOW_START && requestHour < WINDOW_END) {
    scheduledDate.setHours(requestHour, requestCreatedAt.getMinutes(), 0, 0);
  } 
  // Si solicitud fue antes de 9am o después de 6pm → 9am día siguiente
  else {
    scheduledDate.setHours(WINDOW_START, 0, 0, 0);
  }
  
  return scheduledDate;
}
```

**Ejemplos:**
- Solicitud: 2025-11-07 **07:30** → Follow-up: 2025-11-08 **09:00** ✅
- Solicitud: 2025-11-07 **09:15** → Follow-up: 2025-11-08 **09:15** ✅ (24h exactas)
- Solicitud: 2025-11-07 **14:45** → Follow-up: 2025-11-08 **14:45** ✅ (24h exactas)
- Solicitud: 2025-11-07 **19:00** → Follow-up: 2025-11-08 **09:00** ✅

---

## 📊 Resumen de Tiempos

| Tarea | Tiempo estimado | Prioridad |
|-------|----------------|-----------|
| 1. Sidebar con iconos | 2-3 horas | Alta |
| 2. Página Solicitudes Asesor | 3-4 horas | Alta |
| 3. Exportar Conversaciones CSV | 1-2 horas | Media |
| 4. Sistema Follow-up | 6-8 horas | Alta |
| **TOTAL** | **12-17 horas** | **~2-3 días** |

---

## 🎯 Orden de Ejecución Recomendado

**Día 1 (6-7 horas):**
1. Sidebar minimalista (2-3h)
2. Página Solicitudes Asesor (3-4h)

**Día 2 (6-8 horas):**
3. Sistema de Follow-up completo (6-8h)

**Día 3 (1-2 horas):**
4. Exportar conversaciones CSV (1-2h)
5. Testing general

---

## 📝 Notas Importantes

### Sobre Solicitudes de Asesor:
- **NO es un CRM completo**
- Solo visualización histórica + toggle estado
- El seguimiento real se hace por WhatsApp
- Exportar CSV para respaldo/análisis externo

### Sobre Follow-up:
- Usa ventana gratuita de WhatsApp (24h)
- Respeta horarios de atención (9am-4pm)
- Cooldown de 48h para no saturar
- Mensaje configurable desde bot_config
- Se desactiva si usuario agenda cita

### Sobre Analytics Avanzado:
- **Posponer para fase posterior**
- Primero completar funcionalidad core
- Considerar después de Deploy a producción

---

**Última actualización:** 7 de noviembre de 2025  
**Estado:** ✅ Aprobado - Listo para ejecución
