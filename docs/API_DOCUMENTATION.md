# API Documentation - Bot Europa

**Base URL**: `https://tu-dominio.vercel.app/api`  
**Última actualización**: 2025-10-21

---

## 1. Webhook de WhatsApp

### `POST /api/webhook/whatsapp`

Recibe mensajes entrantes de WhatsApp Business API.

#### Headers
```
Content-Type: application/json
X-Hub-Signature-256: sha256=... (validación de Meta)
```

#### Request Body
```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "WHATSAPP_BUSINESS_ACCOUNT_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "PHONE_NUMBER",
          "phone_number_id": "PHONE_NUMBER_ID"
        },
        "contacts": [{
          "profile": {
            "name": "USER_NAME"
          },
          "wa_id": "WHATSAPP_ID"
        }],
        "messages": [{
          "from": "SENDER_PHONE",
          "id": "MESSAGE_ID",
          "timestamp": "TIMESTAMP",
          "type": "text",
          "text": {
            "body": "mensaje del usuario"
          }
        }]
      }
    }]
  }]
}
```

#### Response
```json
{
  "status": "received"
}
```

#### Flujo Interno
```typescript
1. Validar firma de Meta
2. Extraer mensaje y usuario
3. Buscar o crear usuario en BD
4. Procesar mensaje con MessageProcessor
5. Generar respuesta con Intent Engine
6. Enviar respuesta por WhatsApp
7. Guardar conversación en BD
```

---

### `GET /api/webhook/whatsapp`

Verificación del webhook (requerido por Meta).

#### Query Parameters
- `hub.mode`: "subscribe"
- `hub.verify_token`: Token configurado
- `hub.challenge`: Valor a retornar

#### Response
Retorna `hub.challenge` si el token es válido.

---

## 2. Cron Jobs (Seguimiento Automático)

### `GET /api/cron/followup`

Procesa mensajes de seguimiento programados.

#### Headers
```
Authorization: Bearer CRON_SECRET
```

#### Response
```json
{
  "processed": 15,
  "sent": 12,
  "failed": 3,
  "errors": []
}
```

#### Lógica
```typescript
1. Buscar followups con scheduled_for <= NOW() y status = 'pending'
2. Para cada uno:
   - Verificar que el usuario no haya respondido
   - Enviar mensaje personalizado
   - Marcar como 'sent'
   - Actualizar user.last_interaction_at
3. Manejar errores y reintentos
```

---

## 3. APIs Internas (Dashboard)

### `GET /api/internal/users`

Lista de usuarios con filtros.

#### Headers
```
Authorization: Bearer SUPABASE_AUTH_TOKEN
```

#### Query Parameters
- `status`: "hot" | "warm" | "cold"
- `hasAppointment`: boolean
- `page`: number
- `limit`: number

#### Response
```json
{
  "users": [
    {
      "id": "uuid",
      "phone_number": "+52XXXXXXXXXX",
      "name": "Juan Pérez",
      "lead_score": 75,
      "lead_status": "hot",
      "checkpoints_completed": 5,
      "last_interaction_at": "2025-10-21T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150
  }
}
```

---

### `GET /api/internal/users/:userId/conversations`

Historial de conversaciones de un usuario.

#### Response
```json
{
  "user": {
    "id": "uuid",
    "name": "Juan Pérez",
    "phone_number": "+52XXXXXXXXXX"
  },
  "conversations": [
    {
      "id": "uuid",
      "direction": "incoming",
      "message_text": "Cuanto cuesta?",
      "detected_intent": "precio",
      "intent_confidence": 0.92,
      "sent_at": "2025-10-21T10:15:00Z"
    },
    {
      "id": "uuid",
      "direction": "outgoing",
      "message_text": "Los lotes inician desde $450,000 MXN...",
      "sent_at": "2025-10-21T10:15:05Z"
    }
  ]
}
```

---

### `GET /api/internal/users/:userId/progress`

Progreso de checkpoints del usuario.

#### Response
```json
{
  "user_id": "uuid",
  "checkpoints": {
    "precio": {
      "completed": true,
      "completed_at": "2025-10-21T10:15:00Z"
    },
    "ubicacion": {
      "completed": true,
      "completed_at": "2025-10-21T10:20:00Z"
    },
    "modelo": {
      "completed": false,
      "completed_at": null
    },
    "creditos": {
      "completed": true,
      "completed_at": "2025-10-21T10:25:00Z"
    },
    "seguridad": {
      "completed": false,
      "completed_at": null
    },
    "brochure": {
      "completed": true,
      "completed_at": "2025-10-21T10:30:00Z"
    }
  },
  "total_completed": 4,
  "ready_for_appointment": true,
  "appointment_offered": false
}
```

---

### `POST /api/internal/users/:userId/take-control`

Tomar control manual de una conversación.

#### Request Body
```json
{
  "admin_id": "uuid",
  "reason": "user_request"
}
```

#### Response
```json
{
  "success": true,
  "bot_paused": true,
  "controlled_by": "uuid"
}
```

---

### `POST /api/internal/users/:userId/release-control`

Liberar control y reactivar bot.

#### Response
```json
{
  "success": true,
  "bot_active": true
}
```

---

### `GET /api/internal/appointments`

Lista de citas agendadas.

#### Query Parameters
- `status`: "confirmed" | "completed" | "cancelled"
- `date_from`: ISO date
- `date_to`: ISO date

#### Response
```json
{
  "appointments": [
    {
      "id": "uuid",
      "user": {
        "name": "Juan Pérez",
        "phone": "+52XXXXXXXXXX"
      },
      "appointment_date": "2025-10-25",
      "time_slot": "temprano",
      "time_range": "09:00 - 11:00",
      "status": "confirmed",
      "created_at": "2025-10-21T10:35:00Z"
    }
  ]
}
```

---

### `GET /api/internal/analytics/dashboard`

Métricas generales del dashboard.

#### Response
```json
{
  "overview": {
    "total_users": 150,
    "active_today": 25,
    "active_this_week": 78,
    "hot_leads": 18,
    "warm_leads": 45,
    "cold_leads": 87
  },
  "appointments": {
    "confirmed": 12,
    "completed": 35,
    "no_show": 3,
    "conversion_rate": 0.31
  },
  "intents": {
    "most_asked": [
      { "intent": "precio", "count": 145 },
      { "intent": "ubicacion", "count": 132 },
      { "intent": "creditos", "count": 98 }
    ]
  },
  "performance": {
    "avg_response_time_seconds": 1.2,
    "intent_detection_accuracy": 0.94,
    "fallback_rate": 0.08
  }
}
```

---

## 4. Seguridad

### Webhook de WhatsApp
- Validación de firma `X-Hub-Signature-256`
- Verificación del token en setup

### Cron Jobs
- Header `Authorization: Bearer CRON_SECRET`
- Solo accesible desde IPs de Vercel

### APIs Internas
- Autenticación con Supabase Auth
- Row Level Security en BD
- Validación de roles (admin/asesor)

---

## 5. Rate Limiting

```typescript
// Implementación con Vercel KV o Upstash
const rateLimit = {
  webhook: "100 requests / minute",
  api: "60 requests / minute per user"
}
```

---

## 6. Error Handling

### Códigos de Error Estándar

```json
{
  "error": {
    "code": "INTENT_NOT_DETECTED",
    "message": "No se pudo detectar la intención del mensaje",
    "details": {}
  }
}
```

### Códigos Comunes
- `INVALID_SIGNATURE`: Firma del webhook inválida
- `USER_NOT_FOUND`: Usuario no existe
- `INTENT_NOT_DETECTED`: No se detectó intención
- `APPOINTMENT_CONFLICT`: Horario no disponible
- `UNAUTHORIZED`: No autorizado
- `RATE_LIMIT_EXCEEDED`: Límite de requests excedido

---

## 7. Webhooks Salientes (Notificaciones)

### Notificar a Asesores

Cuando un usuario está listo o solicita asesor:

```json
POST https://tu-sistema-externo.com/webhook/lead
{
  "event": "lead_ready",
  "user": {
    "id": "uuid",
    "name": "Juan Pérez",
    "phone": "+52XXXXXXXXXX",
    "lead_score": 85,
    "completed_checkpoints": 5
  },
  "timestamp": "2025-10-21T10:40:00Z"
}
```

---

**Nota**: Todos los endpoints retornan respuestas en formato JSON con timestamps en ISO 8601 (UTC).
