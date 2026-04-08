# Auditoría de Seguridad, Core y Usabilidad — EuropaBot

**Fecha de revisión:** 20 de marzo de 2026  
**Rama auditada:** `main` — commit `1f88b5a`  
**Repositorio:** `leo-neutrondigital/europaBot`  
**Estado git al momento de auditoría:** Sincronizado con `origin/main`. Cambios locales sin commit en `package.json`, `package-lock.json`, `src/hooks/use-analytics.ts` y archivo `.nvmrc` sin seguimiento.

---

## Resumen Ejecutivo

Se auditaron los módulos core (`src/core/`), capa de servicios (`src/services/`), rutas API (`src/app/api/`), middleware, hooks y configuración de entorno. Se encontraron **15 hallazgos**: 3 críticos, 2 altos, 6 medios y 4 bajos/arquitectura.

Los tres hallazgos críticos representan brechas de seguridad activas que deben resolverse antes de operar con tráfico real.

---

## Estado del Repositorio (al momento de la auditoría)

| Aspecto | Estado |
|---|---|
| Sincronización con remoto | Actualizado (`origin/main`) |
| Archivos modificados sin commit | `package.json`, `package-lock.json`, `src/hooks/use-analytics.ts` |
| Archivos no rastreados | `.nvmrc` |
| Último commit | `1f88b5a` — fix: corregir timezone en formato de fechas de citas en UI |

---

## CRÍTICOS

### C-1 — Validación de firma del webhook omitida cuando falta `WHATSAPP_APP_SECRET`

**Severidad:** Crítica  
**Archivo:** `src/services/whatsapp/webhook-validator.ts`

**Problema:**  
La constante `APP_SECRET` se inicializa con fallback a cadena vacía. Si no se define `WHATSAPP_APP_SECRET` en el entorno, el método `validateSignature()` devuelve `true` para cualquier request entrante, sin importar el origen. Un atacante puede enviar mensajes falsos al bot suplantando a WhatsApp.

```ts
const APP_SECRET = process.env.WHATSAPP_APP_SECRET || ''; // fallback silencioso

validateSignature(payload: string, signature: string | null): boolean {
  if (!signature || !APP_SECRET) {
    return true; // acepta CUALQUIER request si la variable no está definida
  }
  ...
}
```

**Agravante:** La variable `WHATSAPP_APP_SECRET` no aparece en `.env.example`, por lo que un deploy fresco no tendrá esta protección activa.

**Corrección requerida:**
- Lanzar error en startup si `WHATSAPP_APP_SECRET` no está definido en entornos no-development.
- Agregar la variable a `.env.example` con documentación.
- En desarrollo, loguear advertencia visible en vez de silenciar el fallo.

---

### C-2 — Endpoints de prueba sin autenticación expuestos en producción

**Severidad:** Crítica  
**Archivos:** `src/app/api/test/process-message/route.ts`, `src/app/api/test/reset-user/route.ts`

**Problema:**  
Ambos endpoints carecen de cualquier verificación de identidad o autorización:

- `POST /api/test/process-message` — Permite inyectar mensajes al bot suplantando cualquier número de teléfono.
- `POST /api/test/reset-user` — Borra permanentemente todo el historial de conversación de cualquier usuario enviando solo su número de teléfono.

**Corrección requerida:**  
Opción A (recomendada): Agregar guard `NODE_ENV !== 'production'` que devuelva `404` al inicio de cada handler.  
Opción B: Proteger con el mismo patrón `CRON_SECRET` / bearer token que usa el endpoint de cron.  
Opción C: Bloquear las rutas `/api/test/*` en `vercel.json` para producción.

---

### C-3 — Endpoint de reset de rate-limit sin autenticación

**Severidad:** Crítica  
**Archivo:** `src/app/api/auth/rate-limit/route.ts`

**Problema:**  
La acción `reset` puede ser invocada por cualquier cliente sin autenticación:

```ts
case 'reset': {
  await resetLoginAttempts(email); // sin verificar quién llama
  return NextResponse.json({ success: true });
}
```

Un atacante puede llamar este endpoint en loop para anular el bloqueo por intentos fallidos y ejecutar fuerza bruta ilimitada sobre cualquier cuenta de administrador.

**Corrección requerida:**  
La acción `reset` debe requerir sesión válida de administrador o moverse a una función interna del servidor (no expuesta como ruta HTTP pública). Las acciones `check` y `record-failed` pueden permanecer accesibles, pero `reset` nunca debe ser pública.

---

## ALTOS

### A-1 — Dos archivos `middleware.ts` en conflicto — el más débil puede estar activo

**Severidad:** Alta  
**Archivos:** `middleware.ts` (raíz del proyecto), `src/middleware.ts`

**Problema:**  
Next.js carga middleware desde la raíz del proyecto **o** desde `src/`, nunca ambos. Con dos archivos presentes existe ambigüedad sobre cuál está activo:

| Aspecto | `middleware.ts` (raíz) | `src/middleware.ts` |
|---|---|---|
| Método de verificación de sesión | `getSession()` — basado en cookie local, falsificable | `getUser()` — verificado en servidor, seguro |
| Security headers (`X-Frame-Options`, `CSP`, etc.) | No aplica | Sí aplica |
| Matcher para `/login` | No incluido | Incluido |

Si el middleware activo es el de la raíz, la protección de rutas es más débil y faltan headers de seguridad HTTP.

**Corrección requerida:**  
Eliminar `middleware.ts` de la raíz del proyecto. Toda la lógica ya está correctamente implementada en `src/middleware.ts`.

---

### A-2 — `.env.example` con nombres de variables incorrectos y variables faltantes

**Severidad:** Alta  
**Archivo:** `.env.example`

**Problema:**  

| Variable en `.env.example` | Variable real en código | Resultado |
|---|---|---|
| `WHATSAPP_VERIFY_TOKEN` | `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Verificación de webhook rota en nuevo deploy |
| (ausente) | `WHATSAPP_APP_SECRET` | Firma de webhook desactivada en nuevo deploy |

Cualquier developer que configure el proyecto desde `.env.example` tendrá el webhook de WhatsApp roto desde el inicio.

**Corrección requerida:**  
Auditar todas las variables `process.env.*` usadas en el código y asegurar que `.env.example` las liste con el nombre exacto y un comentario descriptivo.

---

## MEDIOS

### M-1 — Dynamic imports dentro del webhook handler (overhead por request)

**Severidad:** Media  
**Archivo:** `src/app/api/webhook/whatsapp/route.ts`

**Problema:**  
Los módulos `supabaseServer`, `userRepository` y `configRepository` se importan dinámicamente dentro del handler POST en cada invocación. En una función serverless con alto volumen de mensajes, esto agrega latencia innecesaria y oscurece las dependencias del módulo.

**Corrección requerida:**  
Convertir a imports estáticos en el nivel superior del archivo.

---

### M-2 — String hardcodeado para deduplicación de mensaje configurable en BD

**Severidad:** Media  
**Archivo:** `src/app/api/webhook/whatsapp/route.ts`

**Problema:**  
```ts
if (!lastMessage || !lastMessage.message_text.includes('¡Veo que estás muy interesado!')) {
```
El texto `'¡Veo que estás muy interesado!'` es el valor por defecto de la clave `auto_offer_message` en `bot_config`. Si un administrador cambia ese mensaje desde el dashboard, la lógica de deduplicación silenciosamente deja de funcionar y el mensaje se envía múltiples veces.

**Corrección requerida:**  
Leer el valor actual de `auto_offer_message` desde `configRepository` y usar esa variable en la comparación, no un literal.

---

### M-3 — PII de usuarios (mensajes y teléfonos) logueados a consola en producción

**Severidad:** Media  
**Archivos:** `src/core/intent-engine/fuzzy-matcher.ts`, `src/core/intent-engine/intent-detection.service.ts`, `src/core/followup/followup-processor.ts`

**Problema:**  
Marcados como "LOG TEMPORAL" pero aún activos:
```ts
console.log('Mensaje normalizado:', reconstructedMessage); // contenido del mensaje del usuario
console.log('Palabras extraídas:', words);
console.log('[FollowupProcessor] Enviando follow-up a ${telefono}...'); // número de teléfono
```
En cualquier sistema de agregación de logs (Vercel Logs, Datadog, etc.), estos datos quedan expuestos como PII sin necesidad.

**Corrección requerida:**  
Eliminar todos los `console.log` con contenido de mensajes o datos de usuarios. Si se necesita trazabilidad, usar un logger con nivel configurable que omita PII en producción.

---

### M-4 — `CRON_SECRET` ausente devuelve `500` en vez de rechazar la petición

**Severidad:** Media  
**Archivo:** `src/app/api/cron/schedule-followups/route.ts`

**Problema:**  
```ts
if (!cronSecret) {
  return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
}
```
Retornar `500` cuando falta una variable de entorno revela que la ausencia de configuración es la causa del fallo (information disclosure). La petición debería ser rechazada con `401` o `403` independientemente de la causa interna.

**Corrección requerida:**  
Cambiar el status a `401` o `403` y usar un mensaje genérico como `'Unauthorized'`.

---

### M-5 — `followup_enabled` leído con métodos y defaults distintos en dos subsistemas

**Severidad:** Media  
**Archivos:** `src/core/followup/followup-sender.ts`, `src/core/followup/followup-processor.ts`

**Problema:**  
```ts
// followup-sender.ts
const enabledValue = await configRepository.get('followup_enabled', 'false');
if (enabledValue !== 'true') { ... } // default: desactivado

// followup-processor.ts
const isEnabled = await configRepository.getBoolean('followup_enabled', true);
// default: activado
```
Los dos subsistemas de follow-up tienen comportamientos opuestos cuando `followup_enabled` no está configurado en la base de datos. Esto puede causar que follow-ups se envíen o se omitan de forma inconsistente.

**Corrección requerida:**  
Unificar en un solo método y un solo default. Determinar el comportamiento correcto por defecto (recomendado: `false` / desactivado) y aplicarlo en ambos archivos.

---

### M-6 — Tipo `any` para el cliente Supabase en el intent engine

**Severidad:** Media  
**Archivo:** `src/core/intent-engine/intent-detection.service.ts`

**Problema:**  
```ts
async loadIntents(supabaseClient: any): Promise<void>
async detect(message: string, supabaseClient?: any): Promise<DetectionResult>
```
El uso de `any` elimina la verificación de tipos en tiempo de compilación. Facilita que se pase el cliente equivocado (por ejemplo, el cliente del browser en un contexto server-side) sin que TypeScript lo detecte.

**Corrección requerida:**  
Tipar con `SupabaseClient` del paquete `@supabase/supabase-js` o con el tipo inferido del cliente del proyecto.

---

## BAJOS / DEUDA DE ARQUITECTURA

### B-1 — Lógica de estados de flujo de conversación duplicada en 3 archivos

**Severidad:** Baja (deuda arquitectónica)  
**Archivos:** `src/app/api/webhook/whatsapp/route.ts`, `src/app/api/test/process-message/route.ts`, `src/core/conversation/message-processor.ts`

El manejo de `pending_auto_offer`, `confirm_date` y `ask_time` está replicado en tres lugares. Cualquier cambio al flujo de conversación debe aplicarse en tres archivos distintos, aumentando el riesgo de inconsistencias.

**Corrección recomendada:**  
Centralizar el manejo de estados de flujo en `message-processor.ts` y consumirlo desde los otros dos archivos.

---

### B-2 — `JSON.stringify(filters)` como dependencia de `useEffect`

**Severidad:** Baja  
**Archivo:** `src/hooks/use-advisor-requests.ts`

```ts
useEffect(() => {
  fetchRequests();
}, [JSON.stringify(filters)]);
```
`JSON.stringify` no es una función de comparación estable para dependencias de efecto. En objetos con propiedades de orden variable puede comportarse de forma inesperada. La práctica correcta es usar `useMemo` o comparación profunda con una librería como `fast-deep-equal`.

---

### B-3 — Agregación de analytics en JavaScript en lugar de SQL

**Severidad:** Baja (problema de escala)  
**Archivo:** `src/hooks/use-analytics.ts`

Las funciones `fetchConversationsByDay` y `fetchIntentDistribution` traen todos los registros y los agrupan en el cliente:
```ts
messages?.forEach(msg => { grouped[date] = (grouped[date] || 0) + 1; });
```
Con volumen alto de conversaciones esto transfiere datos innecesarios y es lento. Debe resolverse con `GROUP BY` en la query SQL o mediante funciones RPC en Supabase.

---

### B-4 — `followupScheduler` / `followupSender` posiblemente código huérfano

**Severidad:** Baja  
**Archivos:** `src/core/followup/followup-scheduler.ts`, `src/core/followup/followup-sender.ts`

Ambos cron jobs en `vercel.json` apuntan a `/api/cron/schedule-followups`, que usa `followupProcessor` (envío directo). Los módulos `followupScheduler` y `followupSender` existen en el código pero no hay ninguna ruta HTTP que los invoque. Verificar si son código muerto o si falta una ruta cron que los conecte.

---

## Tabla Resumen

| ID | Severidad | Problema | Archivo(s) |
|---|---|---|---|
| C-1 | **Crítico** | Firma de webhook omitida cuando `WHATSAPP_APP_SECRET` no está definido | `webhook-validator.ts` |
| C-2 | **Crítico** | Endpoints de prueba sin autenticación en producción | `test/process-message`, `test/reset-user` |
| C-3 | **Crítico** | Reset de rate-limit sin autenticación — fuerza bruta posible | `auth/rate-limit/route.ts` |
| A-1 | **Alto** | Dos middleware en conflicto — el más débil puede estar activo | `middleware.ts`, `src/middleware.ts` |
| A-2 | **Alto** | `.env.example` con variables con nombre incorrecto y faltantes | `.env.example` |
| M-1 | **Medio** | Dynamic imports dentro del webhook handler | `webhook/whatsapp/route.ts` |
| M-2 | **Medio** | String hardcodeado para deduplicación de mensaje configurable | `webhook/whatsapp/route.ts` |
| M-3 | **Medio** | PII (mensajes y teléfonos) logueados a consola en producción | `fuzzy-matcher.ts`, `intent-detection.service.ts` |
| M-4 | **Medio** | `CRON_SECRET` ausente devuelve `500` en vez de `401` | `cron/schedule-followups/route.ts` |
| M-5 | **Medio** | `followup_enabled` con defaults contradictorios en dos subsistemas | `followup-sender.ts`, `followup-processor.ts` |
| M-6 | **Medio** | Tipo `any` para cliente Supabase en intent engine | `intent-detection.service.ts` |
| B-1 | **Bajo** | Lógica de estados de flujo duplicada en 3 archivos | webhook, test, message-processor |
| B-2 | **Bajo** | `JSON.stringify(filters)` como dependencia de `useEffect` | `use-advisor-requests.ts` |
| B-3 | **Bajo** | Agregación de analytics en JS en lugar de SQL | `use-analytics.ts` |
| B-4 | **Bajo** | `followupScheduler`/`followupSender` posiblemente código huérfano | `followup-scheduler.ts`, `followup-sender.ts` |

---

## Orden de Prioridad Recomendado

### Sprint inmediato (antes de tráfico en producción)
1. **C-1** — Proteger validación de firma del webhook
2. **C-2** — Bloquear endpoints de prueba en producción
3. **C-3** — Proteger acción `reset` del rate-limit con autenticación
4. **A-1** — Eliminar `middleware.ts` de la raíz
5. **A-2** — Corregir `.env.example` con variables exactas

### Próxima semana
6. **M-3** — Eliminar logs con PII
7. **M-5** — Unificar lectura de `followup_enabled`
8. **M-2** — Reemplazar string hardcodeado con valor dinámico de config

### Backlog técnico
9. **M-1** — Convertir dynamic imports a imports estáticos
10. **M-4** — Cambiar status code de error de config
11. **M-6** — Tipar cliente Supabase correctamente
12. **B-1** — Centralizar lógica de estados de flujo
13. **B-3** — Mover agregación a SQL
14. **B-2** — Corregir dependencia de `useEffect`
15. **B-4** — Confirmar si el subsistema scheduler/sender es código muerto

---

_Revisado por: GitHub Copilot — 20 de marzo de 2026_
