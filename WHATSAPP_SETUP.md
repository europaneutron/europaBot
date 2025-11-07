# Configuración WhatsApp Business API

## ✅ Estado Actual
- Credenciales configuradas en `.env.local`
- Webhook implementado en `/api/webhook/whatsapp`
- Message processor funcional
- Sistema de intenciones listo

## 🚀 Pasos para Activar WhatsApp

### 1. Desplegar a Vercel

```bash
# Desde la terminal
vercel

# Seguir prompts:
# - Link to existing project? Yes
# - Link to EuropaBot? Yes
# - Deploy? Yes
```

Vercel te dará una URL como: `https://europa-bot-xxxxx.vercel.app`

### 2. Configurar Variables de Entorno en Vercel

Ve a tu proyecto en Vercel → Settings → Environment Variables y agrega:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://ceykbgvajjlnybtcsywb.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# WhatsApp
WHATSAPP_API_TOKEN=EAB5uTpjspNQBPrcPfS657pz8XmREClzIcq0YHIYPDZBhl8daW73...
WHATSAPP_PHONE_NUMBER_ID=458574770662643
WHATSAPP_BUSINESS_ACCOUNT_ID=426465080551599
WHATSAPP_WEBHOOK_VERIFY_TOKEN=europa_bot_verify_2025_secure

# App
NEXT_PUBLIC_APP_URL=https://tu-url-vercel.vercel.app
NODE_ENV=production

# Cron
CRON_SECRET=6eIoOP/fWq/gm2bycOi5sEVhUWmAJ7lZhc7L45rpCzk=
```

**Importante**: Después de agregar las variables, hacer **Redeploy** del proyecto.

### 3. Configurar Webhook en Meta for Developers

1. **Ir a**: https://developers.facebook.com/apps
2. **Seleccionar tu app**: (la que tiene el WhatsApp Business API)
3. **WhatsApp → Configuration**
4. **Webhook** section:
   - **Callback URL**: `https://tu-url-vercel.vercel.app/api/webhook/whatsapp`
   - **Verify Token**: `europa_bot_verify_2025_secure`
   - Click **Verify and Save**

5. **Suscribirse a eventos**:
   - Marcar checkbox: `messages`
   - Guardar cambios

### 4. Probar el Bot

#### Opción A: Desde Meta (Número de Prueba)

Meta te da un número de prueba automáticamente. Envía un mensaje desde tu WhatsApp personal a ese número.

#### Opción B: Tu Número de Negocio

Si ya tienes un número verificado:
1. Envía mensaje desde tu WhatsApp al número del bot
2. El bot responderá automáticamente

### 5. Verificar Funcionamiento

Revisa los logs en Vercel:
- Ve a tu proyecto → Deployments → Latest → Functions
- Click en `/api/webhook/whatsapp`
- Verás los logs de cada mensaje recibido

**Logs esperados**:
```
📨 Mensaje recibido de +52XXXXXXXXXX: "Hola"
🎯 Intención detectada: saludo_inicial (95%)
📤 Enviando respuesta...
✅ Mensaje enviado (ID: wamid.XXX)
```

## 🔍 Troubleshooting

### Error: Webhook verification failed
- Verifica que el **Verify Token** en Meta coincida exactamente con `.env`
- Asegúrate que las variables estén en Vercel (no solo en `.env.local`)

### No recibo mensajes
- Verifica que estés suscrito al evento `messages` en Meta
- Revisa logs de Vercel para ver si llegan requests
- Confirma que el token `WHATSAPP_API_TOKEN` no haya expirado

### Bot no responde
- Verifica logs en Vercel Functions
- Confirma que `WHATSAPP_PHONE_NUMBER_ID` sea correcto
- Revisa que Supabase tenga las intenciones configuradas

## 📊 Monitorear Conversaciones

Una vez funcionando:

1. **Dashboard**: `https://tu-url-vercel.vercel.app/dashboard`
2. **Conversaciones**: Ver todas las conversaciones en `/conversations`
3. **Base de Datos**: Revisar tabla `conversations` en Supabase

## 🎯 Siguiente Paso

Una vez que el webhook esté configurado y verificado en Meta:

```bash
# Envía un mensaje de WhatsApp a tu número de bot:
"Hola"

# El bot debería responder automáticamente con el saludo inicial
```

## ⚠️ Importante

- **Tokens de Meta expiran**: Necesitarás renovar `WHATSAPP_API_TOKEN` cada 60 días
- **Rate limits**: Meta tiene límites de mensajes según tu tier (1000/día tier 1)
- **Ventana de 24h**: Solo puedes enviar mensajes dentro de 24h desde el último mensaje del usuario
