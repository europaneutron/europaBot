# Sistema de Follow-up Automático - Configuración

## 📋 Descripción

Sistema de seguimiento automático que detecta usuarios que solicitaron contacto con asesor pero no agendaron cita, y les envía un mensaje de reactivación dentro de las primeras 24 horas.

---

## 🏗️ Arquitectura

### Componentes

1. **followup-scheduler.ts**: Detecta solicitudes abandonadas y programa follow-ups
2. **followup-sender.ts**: Envía mensajes programados por WhatsApp
3. **followup.repository.ts**: Acceso a datos de `scheduled_followups`
4. **API Endpoints (Cron)**:
   - `/api/cron/schedule-followups`: Programa follow-ups (diario 8am)
   - `/api/cron/send-followups`: Envía mensajes (cada 30 min 9am-6pm)

### Flujo Completo

```
1. Usuario solicita asesor → advisor_requests creado
2. Usuario NO agenda cita
3. [CRON 8am] Scheduler detecta solicitud sin cita
4. Scheduler calcula slot: mismo horario día siguiente (24h) o 9am si fuera de ventana
5. Crea registro en scheduled_followups con plantilla + variables
6. [CRON cada 30min 9-6pm] Sender verifica mensajes pendientes
7. Sender valida ventana horaria actual
8. Sender interpola variables {nombre}, {telefono}
9. Sender envía mensaje por WhatsApp
10. Sender registra en conversations (outbound)
11. Sender marca como sent (executed_at)
```

---

## ⚙️ Configuración

### 1. Variables de Entorno

Agregar a Vercel o `.env.local`:

```bash
# Generar CRON_SECRET con:
openssl rand -base64 32

# Ejemplo:
CRON_SECRET=abc123xyz789SecureRandomString456def
```

### 2. Configuración en `bot_config`

El sistema usa configuración dinámica desde la tabla `bot_config`:

```sql
-- Ver configuración actual
SELECT * FROM bot_config WHERE category = 'followup';

-- Modificar ventana horaria
UPDATE bot_config 
SET config_value = '10:00' 
WHERE config_key = 'followup_window_start';

-- Desactivar temporalmente
UPDATE bot_config 
SET config_value = 'false' 
WHERE config_key = 'followup_enabled';

-- Editar plantilla
UPDATE bot_config 
SET config_value = 'Hola {nombre}! Tu mensaje personalizado aquí...' 
WHERE config_key = 'followup_template';
```

**Variables soportadas en plantilla:**
- `{nombre}` → Nombre del usuario (o "Hola!" si no tiene)
- `{telefono}` → Teléfono del usuario

### 3. Cron Jobs en Vercel

El archivo `vercel.json` ya está configurado:

```json
{
  "crons": [
    {
      "path": "/api/cron/schedule-followups",
      "schedule": "0 8 * * *"
    },
    {
      "path": "/api/cron/send-followups",
      "schedule": "*/30 9-18 * * *"
    }
  ]
}
```

**Horarios:**
- **schedule-followups**: Diario a las 8:00 AM (detecta solicitudes del día anterior)
- **send-followups**: Cada hora en punto de 9:00 AM a 6:00 PM (envía mensajes programados)

**Total: 11 ejecuciones/día** (muy por debajo del límite de Vercel Pro: 100/día)

#### ⚠️ Limitaciones de Vercel Cron Jobs

**Límites por plan:**
- **Hobby (Free)**: 0 cron jobs disponibles ❌
- **Pro ($20/mes)**: Hasta 100 ejecuciones/día ✅
- **Enterprise**: Ilimitado

**Con nuestra configuración:**
- ✅ 11 ejecuciones/día = **89 ejecuciones de margen**
- ✅ Cada ejecución procesa **TODOS** los mensajes pendientes (sin límite de cantidad)
- ✅ Ventana de 1 hora es aceptable para follow-ups (no es tiempo real crítico)

**¿Por qué cada hora en lugar de cada 30 min?**
- Reduce ejecuciones de 18/día a 10/día (ahorra cuota)
- Follow-ups no requieren precisión de minutos (30-60 min de diferencia es aceptable)
- Más margen para escalar si necesitas agregar otros cron jobs
- Menor costo computacional en Vercel

#### 📈 Escalabilidad

**Capacidad actual:**
- Con 10 ejecuciones/hora de send-followups
- Sin límite de mensajes por ejecución
- **Soporta fácilmente 100-200 mensajes/día**

**Si creces a +500 mensajes/día:**
- Considera migrar a queue service (Inngest, Trigger.dev, BullMQ)
- O usar webhooks desde Supabase trigger
- O pasar a Vercel Enterprise

**Nota:** Los cron jobs de Vercel solo funcionan en producción, no en desarrollo local.

---

## 🧪 Testing

### Testing Local (sin cron jobs)

Puedes probar los endpoints manualmente con curl:

```bash
# 1. Programar follow-ups
curl -X GET http://localhost:3000/api/cron/schedule-followups \
  -H "Authorization: Bearer tu_CRON_SECRET_aqui"

# Respuesta esperada:
# {
#   "success": true,
#   "scheduled": 3,
#   "timestamp": "2025-11-07T14:30:00.000Z"
# }

# 2. Enviar follow-ups (solo funciona entre 9am-6pm)
curl -X GET http://localhost:3000/api/cron/send-followups \
  -H "Authorization: Bearer tu_CRON_SECRET_aqui"

# Respuesta esperada:
# {
#   "success": true,
#   "sent": 2,
#   "skipped": 0,
#   "errors": 0,
#   "timestamp": "2025-11-07T14:30:00.000Z",
#   "details": [...]
# }
```

### Testing en Producción

Los cron jobs se ejecutarán automáticamente según el schedule configurado. Puedes monitorear en:

1. **Vercel Dashboard** → Tu Proyecto → Cron Jobs
2. **Logs de Vercel** → Filtrar por "CRON"
3. **Base de Datos**:

```sql
-- Ver follow-ups programados
SELECT * FROM scheduled_followups 
WHERE status = 'pending' 
ORDER BY scheduled_for ASC;

-- Ver follow-ups enviados hoy
SELECT * FROM scheduled_followups 
WHERE status = 'sent' 
  AND DATE(executed_at) = CURRENT_DATE;

-- Estadísticas
SELECT 
  status,
  COUNT(*) as total,
  DATE(created_at) as fecha
FROM scheduled_followups
GROUP BY status, DATE(created_at)
ORDER BY fecha DESC;
```

### Prueba Manual Completa

1. **Crear solicitud de asesor**:
```sql
INSERT INTO advisor_requests (user_id, status, lead_score, fallback_count)
VALUES ('user-uuid-here', 'pending', 85, 2);
```

2. **Ejecutar scheduling** (llamar endpoint manualmente o esperar cron 8am)

3. **Verificar programación**:
```sql
SELECT * FROM scheduled_followups 
WHERE user_id = 'user-uuid-here' 
ORDER BY created_at DESC LIMIT 1;
```

4. **Ajustar scheduled_for a ahora** (solo para testing):
```sql
UPDATE scheduled_followups 
SET scheduled_for = NOW() 
WHERE id = 'followup-uuid-here';
```

5. **Ejecutar envío** (llamar endpoint send-followups entre 9am-6pm)

6. **Verificar envío**:
```sql
SELECT * FROM scheduled_followups WHERE id = 'followup-uuid-here';
-- Debe tener status='sent' y executed_at con timestamp

SELECT * FROM conversations WHERE user_id = 'user-uuid-here' AND direction = 'outbound';
-- Debe existir el mensaje enviado
```

---

## 🛠️ Algoritmo Inteligente

### calculateNextAvailableSlot()

**Objetivo:** Enviar follow-up dentro de ventana 9am-6pm, respetando 24h cuando sea posible.

**Ejemplos:**

| Solicitud       | Follow-up Programado | Razón                          |
|-----------------|---------------------|--------------------------------|
| 07:30 AM        | 09:00 AM siguiente  | Fuera de ventana → 1er slot    |
| 09:15 AM        | 09:15 AM siguiente  | 24h exactas dentro de ventana  |
| 12:00 PM        | 12:00 PM siguiente  | 24h exactas dentro de ventana  |
| 05:45 PM        | 05:45 PM siguiente  | 24h exactas dentro de ventana  |
| 07:00 PM        | 09:00 AM siguiente  | Fuera de ventana → 1er slot    |
| 11:00 PM        | 09:00 AM siguiente  | Fuera de ventana → 1er slot    |

**Código:**
```typescript
if (requestHour >= 9 && requestHour < 18) {
  // Dentro de ventana: mismo horario día siguiente (24h)
  scheduledDate.setHours(requestHour, requestMinutes, 0, 0);
} else {
  // Fuera de ventana: 9am día siguiente
  scheduledDate.setHours(9, 0, 0, 0);
}
```

---

## 📊 Monitoreo

### KPIs del Sistema

```sql
-- Tasa de respuesta a follow-ups
SELECT 
  COUNT(CASE WHEN user_responded = true THEN 1 END)::float / COUNT(*) * 100 as response_rate
FROM scheduled_followups
WHERE status = 'sent';

-- Follow-ups enviados por día
SELECT 
  DATE(executed_at) as fecha,
  COUNT(*) as enviados
FROM scheduled_followups
WHERE status = 'sent'
GROUP BY DATE(executed_at)
ORDER BY fecha DESC;

-- Errores recientes
SELECT * FROM scheduled_followups 
WHERE status = 'error' 
ORDER BY created_at DESC 
LIMIT 10;
```

### Logs Importantes

```
[FollowupScheduler] Detectando solicitudes abandonadas...
[FollowupScheduler] Encontradas X solicitudes sin cita
[FollowupScheduler] Programado follow-up para user_id X a las YYYY-MM-DD HH:mm

[FollowupSender] Iniciando envío de mensajes pendientes...
[FollowupSender] X mensajes pendientes encontrados
[FollowupSender] Enviando mensaje a +52XXXXXXXXXX...
[FollowupSender] ✅ Mensaje enviado exitosamente a +52XXXXXXXXXX
[FollowupSender] Resumen: X enviados, Y omitidos, Z errores

[CRON] ✅ Programados: X follow-ups
[CRON] ✅ Enviados: X, Omitidos: Y, Errores: Z
```

---

## 🚨 Troubleshooting

### Follow-ups no se programan

1. Verificar que `followup_enabled = 'true'` en bot_config
2. Verificar que existan advisor_requests sin cita
3. Verificar que no tengan follow-up ya programado
4. Revisar logs de cron job schedule-followups

### Follow-ups no se envían

1. Verificar hora actual (debe estar entre 9am-6pm)
2. Verificar que `scheduled_for` sea <= hora actual
3. Verificar WHATSAPP_API_TOKEN y WHATSAPP_PHONE_NUMBER_ID
4. Revisar logs de cron job send-followups
5. Verificar status de mensajes en `scheduled_followups`

### Cron jobs no se ejecutan

1. **Solo funcionan en producción de Vercel**
2. Verificar que vercel.json esté en root del proyecto
3. Verificar configuración en Vercel Dashboard → Cron Jobs
4. Verificar que CRON_SECRET esté configurado en Vercel

### Errores 401 Unauthorized

1. Verificar que CRON_SECRET esté configurado correctamente
2. Verificar header: `Authorization: Bearer ${CRON_SECRET}`
3. Regenerar CRON_SECRET si es necesario

---

## 🔧 Mantenimiento

### Desactivar temporalmente

```sql
UPDATE bot_config 
SET config_value = 'false' 
WHERE config_key = 'followup_enabled';
```

### Cambiar ventana horaria

```sql
-- Extender hasta 8pm
UPDATE bot_config 
SET config_value = '20:00' 
WHERE config_key = 'followup_window_end';

-- Iniciar a las 8am
UPDATE bot_config 
SET config_value = '08:00' 
WHERE config_key = 'followup_window_start';
```

### Limpiar follow-ups antiguos

```sql
-- Eliminar follow-ups enviados hace más de 30 días
DELETE FROM scheduled_followups 
WHERE status = 'sent' 
  AND executed_at < NOW() - INTERVAL '30 days';
```

### Cancelar follow-up específico

```sql
UPDATE scheduled_followups 
SET status = 'cancelled' 
WHERE id = 'followup-uuid-here';
```

---

## 📚 Referencias

- Documentación Vercel Cron: https://vercel.com/docs/cron-jobs
- WhatsApp Business API: https://developers.facebook.com/docs/whatsapp
- Algoritmo detallado: Ver `docs/PLAN_MEJORAS_UX.md` sección 4

---

**Última actualización:** 7 de noviembre de 2025  
**Versión:** 1.0.0
