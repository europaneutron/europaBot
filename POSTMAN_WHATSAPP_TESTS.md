# Tests de WhatsApp API con Postman

## 🔑 Información Necesaria

Antes de empezar, ten a mano estos datos de tu `.env.local`:

```
WHATSAPP_API_TOKEN=EAB5uTpjspNQBPrcPfS657pz8XmREClzIcq0YHIYPDZBhl8daW73...
WHATSAPP_PHONE_NUMBER_ID=458574770662643
WHATSAPP_BUSINESS_ACCOUNT_ID=426465080551599
```

---

## 📋 Test 1: Verificar Token y Obtener Info del Teléfono

**Propósito**: Confirmar que tu token es válido y obtener información del número de WhatsApp Business.

### Configuración en Postman:

**Método**: `GET`

**URL**: 
```
https://graph.facebook.com/v24.0/{{PHONE_NUMBER_ID}}
```

**Headers**:
```
Authorization: Bearer {{WHATSAPP_API_TOKEN}}
```

**Variables de Postman**:
- `PHONE_NUMBER_ID` = `458574770662643`
- `WHATSAPP_API_TOKEN` = `EAB5uTpjspNQBPrcPfS657pz8XmREClzIcq0YHIYPDZBhl8daW73...`

### Respuesta Exitosa:
```json
{
  "verified_name": "Fraccionamiento Europa",
  "display_phone_number": "+52 123 456 7890",
  "quality_rating": "GREEN",
  "id": "458574770662643"
}
```

### Errores Comunes:
- **Error 190**: Token inválido o expirado
- **Error 100**: Parámetro inválido (verifica PHONE_NUMBER_ID)
- **Error 200**: Permisos insuficientes

---

## 📋 Test 2: Obtener Información de la Cuenta Business

**Propósito**: Verificar permisos y datos de la cuenta de WhatsApp Business.

### Configuración en Postman:

**Método**: `GET`

**URL**: 
```
https://graph.facebook.com/v24.0/{{BUSINESS_ACCOUNT_ID}}
```

**Headers**:
```
Authorization: Bearer {{WHATSAPP_API_TOKEN}}
```

**Query Params**:
```
fields=id,name,timezone_id,message_template_namespace
```

**Variables de Postman**:
- `BUSINESS_ACCOUNT_ID` = `426465080551599`
- `WHATSAPP_API_TOKEN` = `EAB5uTpjspNQBPrcPfS657pz8XmREClzIcq0YHIYPDZBhl8daW73...`

### Respuesta Exitosa:
```json
{
  "id": "426465080551599",
  "name": "Fraccionamiento Europa",
  "timezone_id": "America/Mexico_City",
  "message_template_namespace": "xxxxxx_xxxx_xxxx"
}
```

---

## 📋 Test 3: Enviar Mensaje de Prueba (IMPORTANTE)

**⚠️ ADVERTENCIA**: Este test ENVIARÁ un mensaje real a un número de WhatsApp. Usa tu propio número para pruebas.

### Configuración en Postman:

**Método**: `POST`

**URL**: 
```
https://graph.facebook.com/v24.0/{{PHONE_NUMBER_ID}}/messages
```

**Headers**:
```
Authorization: Bearer {{WHATSAPP_API_TOKEN}}
Content-Type: application/json
```

**Body** (raw JSON):
```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "521234567890",
  "type": "text",
  "text": {
    "preview_url": false,
    "body": "🤖 Test desde Postman - EuropaBot está funcionando correctamente!"
  }
}
```

**Variables de Postman**:
- `PHONE_NUMBER_ID` = `458574770662643`
- `WHATSAPP_API_TOKEN` = `EAB5uTpjspNQBPrcPfS657pz8XmREClzIcq0YHIYPDZBhl8daW73...`

**⚠️ Reemplaza**: `521234567890` con TU número de WhatsApp (formato: código país + número, sin + ni espacios)

### Respuesta Exitosa:
```json
{
  "messaging_product": "whatsapp",
  "contacts": [
    {
      "input": "521234567890",
      "wa_id": "521234567890"
    }
  ],
  "messages": [
    {
      "id": "wamid.HBgNNTIxMjM0NTY3ODkwFQIAERgSRjBBODhEMkY3QzFFRkE3RTkzAA=="
    }
  ]
}
```

### Errores Comunes:
- **Error 131026**: El número no está registrado en WhatsApp
- **Error 131047**: Re-engagement message - necesitas que el usuario te escriba primero
- **Error 131051**: Mensaje no enviado, tipo de contenido no soportado
- **Error 133016**: Rate limit - demasiados mensajes

---

## 📋 Test 4: Verificar Templates de Mensajes

**Propósito**: Ver qué plantillas (templates) aprobadas tienes disponibles.

### Configuración en Postman:

**Método**: `GET`

**URL**: 
```
https://graph.facebook.com/v24.0/{{BUSINESS_ACCOUNT_ID}}/message_templates
```

**Headers**:
```
Authorization: Bearer {{WHATSAPP_API_TOKEN}}
```

**Query Params**:
```
limit=10
```

**Variables de Postman**:
- `BUSINESS_ACCOUNT_ID` = `426465080551599`
- `WHATSAPP_API_TOKEN` = `EAB5uTpjspNQBPrcPfS657pz8XmREClzIcq0YHIYPDZBhl8daW73...`

### Respuesta Exitosa:
```json
{
  "data": [
    {
      "name": "hello_world",
      "components": [...],
      "language": "es",
      "status": "APPROVED",
      "category": "UTILITY",
      "id": "1234567890"
    }
  ],
  "paging": {...}
}
```

---

## 🚀 Importar a Postman

### Opción 1: Colección JSON completa

Crea un archivo `WhatsApp_API_Tests.postman_collection.json` con este contenido:

```json
{
  "info": {
    "name": "WhatsApp Business API - EuropaBot",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    {
      "key": "WHATSAPP_API_TOKEN",
      "value": "EAB5uTpjspNQBPrcPfS657pz8XmREClzIcq0YHIYPDZBhl8daW73...",
      "type": "string"
    },
    {
      "key": "PHONE_NUMBER_ID",
      "value": "458574770662643",
      "type": "string"
    },
    {
      "key": "BUSINESS_ACCOUNT_ID",
      "value": "426465080551599",
      "type": "string"
    }
  ],
  "item": [
    {
      "name": "1. Verificar Token y Phone Info",
      "request": {
        "method": "GET",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{WHATSAPP_API_TOKEN}}"
          }
        ],
        "url": {
          "raw": "https://graph.facebook.com/v24.0/{{PHONE_NUMBER_ID}}",
          "protocol": "https",
          "host": ["graph", "facebook", "com"],
          "path": ["v24.0", "{{PHONE_NUMBER_ID}}"]
        }
      }
    },
    {
      "name": "2. Info Cuenta Business",
      "request": {
        "method": "GET",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{WHATSAPP_API_TOKEN}}"
          }
        ],
        "url": {
          "raw": "https://graph.facebook.com/v24.0/{{BUSINESS_ACCOUNT_ID}}?fields=id,name,timezone_id",
          "protocol": "https",
          "host": ["graph", "facebook", "com"],
          "path": ["v24.0", "{{BUSINESS_ACCOUNT_ID}}"],
          "query": [
            {
              "key": "fields",
              "value": "id,name,timezone_id"
            }
          ]
        }
      }
    },
    {
      "name": "3. Enviar Mensaje Test",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{WHATSAPP_API_TOKEN}}"
          },
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"messaging_product\": \"whatsapp\",\n  \"recipient_type\": \"individual\",\n  \"to\": \"521234567890\",\n  \"type\": \"text\",\n  \"text\": {\n    \"body\": \"🤖 Test desde Postman - EuropaBot funcionando!\"\n  }\n}"
        },
        "url": {
          "raw": "https://graph.facebook.com/v24.0/{{PHONE_NUMBER_ID}}/messages",
          "protocol": "https",
          "host": ["graph", "facebook", "com"],
          "path": ["v24.0", "{{PHONE_NUMBER_ID}}", "messages"]
        }
      }
    },
    {
      "name": "4. Ver Templates Disponibles",
      "request": {
        "method": "GET",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{WHATSAPP_API_TOKEN}}"
          }
        ],
        "url": {
          "raw": "https://graph.facebook.com/v24.0/{{BUSINESS_ACCOUNT_ID}}/message_templates?limit=10",
          "protocol": "https",
          "host": ["graph", "facebook", "com"],
          "path": ["v24.0", "{{BUSINESS_ACCOUNT_ID}}", "message_templates"],
          "query": [
            {
              "key": "limit",
              "value": "10"
            }
          ]
        }
      }
    }
  ]
}
```

### Importar en Postman:
1. Abre Postman
2. Click en **Import** (esquina superior izquierda)
3. Arrastra el archivo JSON
4. Edita las **Variables** de la colección con tus datos reales

---

## ✅ Checklist de Validación

Ejecuta los tests en este orden:

- [ ] **Test 1**: Verificar Token → Debe retornar info del teléfono
- [ ] **Test 2**: Info Cuenta → Debe retornar nombre de la cuenta
- [ ] **Test 4**: Templates → Ver qué templates tienes aprobados
- [ ] **Test 3**: Enviar Mensaje → **ÚLTIMO** (envía mensaje real)

### Resultados Esperados:

✅ **Token válido**: Todos los tests retornan 200 OK
❌ **Token inválido**: Error 190 en Test 1
⚠️ **Token expirado**: Error 190 - necesitas renovar token en Meta
⚠️ **Sin permisos**: Error 200 - revisa permisos de la app en Meta

---

## 🔄 Renovar Token (si expiró)

Si obtienes **Error 190**, necesitas generar un nuevo token:

1. Ve a: https://developers.facebook.com/apps
2. Selecciona tu app
3. **WhatsApp → API Setup**
4. Click en **Generate Token** (temporal - 24h) o **System User Token** (permanente)
5. Copia el nuevo token
6. Actualiza en `.env.local` y Vercel

---

## 📚 Referencias

- [WhatsApp Business API Docs](https://developers.facebook.com/docs/whatsapp)
- [Códigos de Error](https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes)
- [Message Templates](https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates)
