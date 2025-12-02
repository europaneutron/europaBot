# 🔒 PLAN DE SEGURIDAD - SISTEMA DE AUTENTICACIÓN

**Proyecto:** EuropaBot  
**Fecha de creación:** 21 de noviembre de 2025  
**Estado:** 📋 Planificación  
**Prioridad:** 🔴 CRÍTICO

---

## 📋 ÍNDICE

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Vulnerabilidades Identificadas](#vulnerabilidades-identificadas)
3. [Plan de Implementación](#plan-de-implementación)
4. [Fase 1: Críticas](#fase-1-críticas-prioridad-máxima)
5. [Fase 2: Altas](#fase-2-altas)
6. [Fase 3: Medias](#fase-3-medias)
7. [Fase 4: Validación](#fase-4-validación-y-testing)
8. [Checklist Final](#checklist-final)

---

## 🎯 RESUMEN EJECUTIVO

### Estado Actual
- **Vulnerabilidades Críticas:** 2
- **Vulnerabilidades Altas:** 3
- **Vulnerabilidades Medias:** 4
- **Aspectos Seguros:** 5 ✅

### Tiempo Estimado Total
- **Fase 1 (Críticas):** 1-2 días
- **Fase 2 (Altas):** 2-3 días
- **Fase 3 (Medias):** 1 día
- **Fase 4 (Testing):** 1 día
- **TOTAL:** 5-7 días de trabajo

### Dependencias Externas
- Vercel KV o Upstash Redis (para rate limiting)
- Configuración en Supabase Dashboard (políticas de contraseñas)

---

## 🔍 VULNERABILIDADES IDENTIFICADAS

### 🔴 Críticas (Bloquean producción)

| ID | Vulnerabilidad | Impacto | Archivos Afectados |
|----|---------------|---------|-------------------|
| **C1** | Sin Rate Limiting - Brute Force | Compromiso de cuentas | `login/page.tsx`, `auth-context.tsx` |
| **C2** | Contraseñas Débiles | Ataques de diccionario | Configuración Supabase, validadores |

### 🟠 Altas (Deben resolverse pronto)

| ID | Vulnerabilidad | Impacto | Archivos Afectados |
|----|---------------|---------|-------------------|
| **A1** | Sin protección CSRF | Acciones no autorizadas | `middleware.ts`, `next.config.mjs` |
| **A2** | Sesiones sin timeout | Sesiones indefinidas | Configuración Supabase, hooks |
| **A3** | Credenciales en código | Exposición accidental | `login/page.tsx` línea 138 |

### 🟡 Medias (Mejoras recomendadas)

| ID | Vulnerabilidad | Impacto | Archivos Afectados |
|----|---------------|---------|-------------------|
| **M1** | Validación de email básica | UX y seguridad | `login/page.tsx` |
| **M2** | Mensajes de error genéricos | Información limitada | `auth-context.tsx` |
| **M3** | XSS (bajo riesgo) | Prevención | Revisión general |
| **M4** | SQL Injection (protegido) | N/A - Ya seguro ✅ | N/A |

---

## 📅 PLAN DE IMPLEMENTACIÓN

### Estrategia
1. **Incremental:** Una vulnerabilidad a la vez
2. **Verificable:** Testing después de cada implementación
3. **Documentado:** Commit descriptivo por cada fix
4. **Reversible:** Cambios pequeños y aislados

### Ramas de Trabajo
```bash
main (producción estable)
  └── feature/security-improvements
      ├── fix/rate-limiting
      ├── fix/password-policy
      ├── fix/csrf-protection
      ├── fix/session-management
      └── fix/input-validation
```

---

## 🚨 FASE 1: CRÍTICAS (Prioridad Máxima)

**Duración estimada:** 1-2 días  
**Bloqueante para producción:** ✅ SÍ

---

### C1: Rate Limiting para Login

#### 📝 Objetivo
Prevenir ataques de fuerza bruta limitando intentos de login a 5 cada 15 minutos.

#### 🎯 Criterios de Éxito
- [ ] Máximo 5 intentos por email cada 15 minutos
- [ ] Usuario bloqueado muestra mensaje claro con tiempo restante
- [ ] Contador se resetea después del login exitoso
- [ ] Logs de intentos fallidos registrados

#### 🔧 Tareas

**1.1 Crear migración de base de datos**
```bash
Archivo: supabase/migrations/018_login_attempts.sql
```
- [ ] Crear tabla `login_attempts`
  - Campos: `id`, `identifier` (email), `attempt_count`, `locked_until`, `last_attempt`
  - Índices en `identifier` y `locked_until`
- [ ] Función de limpieza automática de registros antiguos
- [ ] Aplicar migración en Supabase

**1.2 Implementar lógica de rate limiting**
```bash
Archivo: src/utils/rate-limit.ts
```
- [ ] Función `checkLoginAttempts(email: string)`
  - Verificar intentos recientes
  - Verificar si está bloqueado
  - Retornar estado y tiempo restante
- [ ] Función `recordFailedAttempt(email: string)`
  - Incrementar contador
  - Bloquear si alcanza límite (5 intentos)
- [ ] Función `resetAttempts(email: string)`
  - Limpiar contador después de login exitoso

**1.3 Integrar en auth-context**
```bash
Archivo: src/contexts/auth-context.tsx
```
- [ ] Importar utilidades de rate limiting
- [ ] Verificar límite ANTES de llamar a Supabase
- [ ] Registrar intento fallido si error de login
- [ ] Resetear contador si login exitoso
- [ ] Mostrar mensaje apropiado según estado

**1.4 Actualizar UI de login**
```bash
Archivo: src/app/(auth)/login/page.tsx
```
- [ ] Mostrar mensaje de bloqueo si está limitado
- [ ] Indicador de intentos restantes
- [ ] Deshabilitar botón si bloqueado
- [ ] Temporizador visual de desbloqueo

#### 🧪 Testing
- [ ] Intentar 5 logins fallidos consecutivos
- [ ] Verificar bloqueo de 15 minutos
- [ ] Verificar reset después de login exitoso
- [ ] Verificar limpieza de registros antiguos

#### 📦 Alternativas
- **Opción A:** Supabase Edge Function (sin dependencias externas) ⭐ RECOMENDADO
- **Opción B:** Vercel KV + @upstash/ratelimit (más robusto, requiere servicio externo)

---

### C2: Política de Contraseñas Robustas

#### 📝 Objetivo
Forzar contraseñas seguras con validación cliente y servidor.

#### 🎯 Criterios de Éxito
- [ ] Mínimo 12 caracteres
- [ ] Al menos 1 mayúscula, 1 minúscula, 1 número, 1 carácter especial
- [ ] Sin patrones comunes (123, abc, password, etc.)
- [ ] Medidor visual de fortaleza
- [ ] Validación funciona en registro Y cambio de contraseña

#### 🔧 Tareas

**2.1 Configurar Supabase Dashboard**
```
Settings > Authentication > Password Policy
```
- [ ] Minimum length: 12
- [ ] Require uppercase: Yes
- [ ] Require lowercase: Yes
- [ ] Require numbers: Yes
- [ ] Require special characters: Yes
- [ ] Guardar captura de pantalla de configuración

**2.2 Crear validador de contraseñas**
```bash
Archivo: src/utils/password-validator.ts
```
- [ ] Interfaz `PasswordValidation`
  - `isValid: boolean`
  - `errors: string[]`
  - `strength: 'débil' | 'media' | 'fuerte'`
  - `score: number (0-100)`
- [ ] Función `validatePassword(password: string)`
  - Validar longitud mínima
  - Validar mayúsculas/minúsculas/números/especiales
  - Detectar patrones comunes
  - Calcular score de fortaleza
- [ ] Tests unitarios

**2.3 Crear componente de medidor visual**
```bash
Archivo: src/components/auth/PasswordStrengthMeter.tsx
```
- [ ] Barra de progreso con colores (rojo/amarillo/verde)
- [ ] Indicador de fortaleza textual
- [ ] Lista de requisitos faltantes
- [ ] Animaciones suaves de transición
- [ ] Accesible (ARIA labels)

**2.4 Integrar en formulario de login**
```bash
Archivo: src/app/(auth)/login/page.tsx
```
- [ ] Importar PasswordStrengthMeter
- [ ] Validar antes de submit
- [ ] Mostrar errores específicos
- [ ] Prevenir submit si contraseña débil

**2.5 Actualizar contexto de auth**
```bash
Archivo: src/contexts/auth-context.tsx
```
- [ ] Validar contraseña antes de llamar a Supabase
- [ ] Manejar errores de política del servidor
- [ ] Mensajes de error claros

#### 🧪 Testing
- [ ] Intentar contraseña de 6 caracteres (rechazada)
- [ ] Intentar "password123" (rechazada)
- [ ] Intentar "Admin123!" (rechazada por corta)
- [ ] Intentar "Admin123!@#$" (aceptada, fuerte)
- [ ] Verificar medidor visual funciona correctamente
- [ ] Verificar mensajes de error son claros

#### 📝 Documentación
- [ ] Actualizar README con política de contraseñas
- [ ] Documentar en `docs/AUTENTICACION.md`

---

## 🟠 FASE 2: ALTAS

**Duración estimada:** 2-3 días  
**Bloqueante para producción:** ⚠️ Recomendado resolver

---

### A1: Protección CSRF

#### 📝 Objetivo
Prevenir ataques Cross-Site Request Forgery mediante validación de origen.

#### 🎯 Criterios de Éxito
- [ ] Validación de headers Origin/Referer en requests POST/PUT/DELETE/PATCH
- [ ] Headers de seguridad configurados
- [ ] Logs de intentos sospechosos
- [ ] Compatible con entorno de desarrollo y producción

#### 🔧 Tareas

**1.1 Crear utilidad de validación CSRF**
```bash
Archivo: src/middleware/csrf-protection.ts
```
- [ ] Lista de orígenes permitidos (incluir localhost para dev)
- [ ] Función `validateCSRF(req: NextRequest)`
  - Validar solo métodos que modifican estado
  - Verificar header Origin
  - Fallback a Referer si no hay Origin
  - Rechazar si no hay ninguno
  - Logging de intentos rechazados
- [ ] Tests unitarios

**1.2 Integrar en middleware principal**
```bash
Archivo: middleware.ts
```
- [ ] Importar `validateCSRF`
- [ ] Ejecutar ANTES de verificación de autenticación
- [ ] Retornar 403 si falla validación
- [ ] No afectar requests GET/HEAD/OPTIONS

**1.3 Configurar headers de seguridad**
```bash
Archivo: next.config.mjs
```
- [ ] Agregar `X-Frame-Options: DENY`
- [ ] Agregar `X-Content-Type-Options: nosniff`
- [ ] Agregar `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] Agregar `Permissions-Policy`
- [ ] Configurar CSP (Content Security Policy) básico

#### 🧪 Testing
- [ ] Request POST desde mismo origen (permitido)
- [ ] Request POST sin Origin/Referer (rechazado)
- [ ] Request POST desde origen no permitido (rechazado)
- [ ] Request GET sin headers (permitido)
- [ ] Verificar headers de seguridad en respuesta

---

### A2: Gestión de Sesiones con Timeouts

#### 📝 Objetivo
Implementar timeouts de sesión por inactividad y límite de sesiones concurrentes.

#### 🎯 Criterios de Éxito
- [ ] Sesión expira después de 15 minutos de inactividad
- [ ] Usuario es redirigido a login con mensaje claro
- [ ] Máximo 3 dispositivos simultáneos por usuario
- [ ] Sesiones pueden ser revocadas manualmente

#### 🔧 Tareas

**2.1 Configurar timeouts en Supabase**
```
Supabase Dashboard > Settings > Authentication
```
- [ ] JWT expiry: 1 hour (3600 seconds)
- [ ] Refresh token expiry: 7 days (604800 seconds)
- [ ] Refresh token rotation: Enabled
- [ ] Documentar configuración

**2.2 Crear hook de timeout de inactividad**
```bash
Archivo: src/hooks/useSessionTimeout.ts
```
- [ ] Constante `INACTIVITY_TIMEOUT = 15 * 60 * 1000` (15 min)
- [ ] Detectar eventos de actividad (mouse, teclado, scroll)
- [ ] Temporizador que se resetea con actividad
- [ ] Logout automático y redirección al expirar
- [ ] Cleanup de event listeners

**2.3 Integrar en layout del dashboard**
```bash
Archivo: src/app/(dashboard)/layout.tsx
```
- [ ] Importar `useSessionTimeout`
- [ ] Ejecutar en todas las páginas protegidas
- [ ] Mostrar modal de advertencia 2 minutos antes

**2.4 Crear migración de sesiones activas**
```bash
Archivo: supabase/migrations/019_session_limits.sql
```
- [ ] Tabla `active_sessions`
  - Campos: `id`, `user_id`, `session_token`, `device_info`, `ip_address`, `last_activity`
- [ ] Trigger para limitar a 3 sesiones por usuario
- [ ] Función de limpieza de sesiones expiradas

**2.5 Crear página de gestión de sesiones**
```bash
Archivo: src/app/(dashboard)/settings/sessions/page.tsx
```
- [ ] Listar dispositivos activos
- [ ] Mostrar última actividad
- [ ] Botón "Cerrar sesión en este dispositivo"
- [ ] Botón "Cerrar todas las sesiones"

#### 🧪 Testing
- [ ] Dejar inactivo 15 minutos, verificar logout
- [ ] Mover mouse, verificar que resetea temporizador
- [ ] Abrir 4 sesiones, verificar que cierra la más antigua
- [ ] Verificar modal de advertencia aparece a los 13 minutos

---

### A3: Eliminar Credenciales de Código

#### 📝 Objetivo
Remover completamente credenciales hardcodeadas del código fuente.

#### 🎯 Criterios de Éxito
- [ ] Sin credenciales visibles en UI
- [ ] Sin credenciales en comentarios o logs
- [ ] Variables de entorno solo para desarrollo local
- [ ] Script de seed para crear usuarios de prueba

#### 🔧 Tareas

**3.1 Eliminar credenciales de login page**
```bash
Archivo: src/app/(auth)/login/page.tsx
```
- [ ] Borrar líneas 135-141 (bloque de credenciales)
- [ ] Verificar no hay referencias en comentarios
- [ ] Commit con mensaje: "security: remove hardcoded credentials"

**3.2 Crear script de seed para desarrollo**
```bash
Archivo: scripts/seed-dev-users.ts
```
- [ ] Verificar `NODE_ENV === 'development'`
- [ ] Crear usuarios de prueba con contraseñas seguras
- [ ] Generar contraseñas aleatorias cada vez
- [ ] Guardar credenciales en archivo local (no commitear)
- [ ] Documentar uso en README

**3.3 Actualizar .gitignore**
```bash
Archivo: .gitignore
```
- [ ] Verificar `.env.local` está incluido ✅
- [ ] Agregar `dev-credentials.txt`
- [ ] Agregar `*.local.json`

**3.4 Búsqueda global de credenciales**
```bash
# Ejecutar comandos de búsqueda
```
- [ ] `grep -r "europa2025" src/` (debe estar vacío)
- [ ] `grep -r "admin@europa" src/` (debe estar vacío)
- [ ] `grep -r "password.*=" src/` (revisar resultados)

#### 🧪 Testing
- [ ] Build de producción sin errores
- [ ] Verificar bundle no contiene credenciales
- [ ] Script de seed funciona en desarrollo

---

## 🟡 FASE 3: MEDIAS

**Duración estimada:** 1 día  
**Bloqueante para producción:** ❌ NO (mejoras de calidad)

---

### M1: Validación Robusta de Email

#### 🔧 Tareas
```bash
Archivo: src/utils/validators.ts
```
- [ ] Función `isValidEmail(email: string): boolean`
- [ ] Regex mejorado
- [ ] Validación de longitudes (local ≤ 64, domain ≤ 255)
- [ ] Prevenir múltiples @ o puntos consecutivos
- [ ] Tests unitarios

```bash
Archivo: src/app/(auth)/login/page.tsx
```
- [ ] Validar email antes de submit
- [ ] Mostrar error si formato inválido
- [ ] Feedback visual (border rojo)

#### 🧪 Testing
- [ ] `test@example.com` ✅
- [ ] `invalid@` ❌
- [ ] `@invalid.com` ❌
- [ ] `test..test@example.com` ❌

---

### M2: Mensajes de Error Seguros

#### 🔧 Tareas
```bash
Archivo: src/contexts/auth-context.tsx
```
- [ ] Unificar mensajes de error
- [ ] No especificar si email o password es incorrecto
- [ ] Mensajes genéricos pero útiles
- [ ] Logging detallado en servidor (no visible al usuario)

**Mensajes recomendados:**
- ❌ "Email no encontrado" → ✅ "Credenciales incorrectas"
- ❌ "Contraseña incorrecta" → ✅ "Credenciales incorrectas"
- ✅ "Demasiados intentos. Espera 15 minutos."
- ✅ "Error del servidor. Intenta nuevamente."

---

### M3: Prevención XSS (Revisión)

#### 🔧 Tareas
- [ ] Búsqueda global de `dangerouslySetInnerHTML` (debe estar vacío)
- [ ] Verificar uso correcto de JSX (escapa automáticamente)
- [ ] Si es necesario HTML, instalar `isomorphic-dompurify`
- [ ] Revisar inputs de usuario que se muestran en UI

---

## 🧪 FASE 4: VALIDACIÓN Y TESTING

**Duración estimada:** 1 día

---

### Testing Manual

#### Escenario 1: Login Normal
- [ ] Ingresar email válido y contraseña correcta
- [ ] Verificar redirección a dashboard
- [ ] Verificar sesión persiste al recargar

#### Escenario 2: Ataque de Fuerza Bruta
- [ ] Intentar 5 logins fallidos
- [ ] Verificar bloqueo de 15 minutos
- [ ] Verificar mensaje claro
- [ ] Esperar 15 minutos y reintentar

#### Escenario 3: Contraseñas Débiles
- [ ] Intentar "123456" (rechazado)
- [ ] Intentar "password" (rechazado)
- [ ] Verificar medidor visual funciona

#### Escenario 4: Timeout de Inactividad
- [ ] Login exitoso
- [ ] Dejar inactivo 15 minutos
- [ ] Verificar logout automático

#### Escenario 5: Múltiples Dispositivos
- [ ] Login en 3 navegadores diferentes
- [ ] Intentar login en 4to dispositivo
- [ ] Verificar cierre de sesión más antigua

#### Escenario 6: CSRF
- [ ] Crear página HTML externa con POST malicioso
- [ ] Intentar ejecutar acción desde origen no permitido
- [ ] Verificar request bloqueado

---

### Testing Automatizado

```bash
# Crear archivo: tests/auth-security.test.ts
```

#### Tests de Rate Limiting
- [ ] Test: 5 intentos fallidos → bloqueado
- [ ] Test: Reset después de login exitoso
- [ ] Test: Limpieza de registros antiguos

#### Tests de Validación de Contraseñas
- [ ] Test: Contraseña corta rechazada
- [ ] Test: Sin mayúsculas rechazada
- [ ] Test: Patrones comunes rechazados
- [ ] Test: Contraseña válida aceptada

#### Tests de CSRF
- [ ] Test: Request sin Origin rechazado
- [ ] Test: Request desde origen no permitido rechazado
- [ ] Test: Request desde origen permitido aceptado

---

## ✅ CHECKLIST FINAL

### Antes de Merge a Main

#### Código
- [ ] Todas las vulnerabilidades críticas resueltas
- [ ] Todas las vulnerabilidades altas resueltas
- [ ] Tests pasan exitosamente
- [ ] Build de producción sin errores
- [ ] Lint sin warnings

#### Base de Datos
- [ ] Migraciones aplicadas en Supabase
- [ ] RLS verificado en todas las tablas
- [ ] Índices creados correctamente
- [ ] Datos de prueba funcionan

#### Configuración
- [ ] Variables de entorno configuradas en Vercel
- [ ] Supabase Dashboard configurado correctamente
- [ ] Vercel KV configurado (si se usa)
- [ ] CRON_SECRET rotado

#### Documentación
- [ ] README actualizado
- [ ] `docs/AUTENTICACION.md` actualizado
- [ ] `docs/SEGURIDAD.md` creado
- [ ] Commits descriptivos

#### Seguridad
- [ ] `.env.local` en .gitignore ✅
- [ ] Sin credenciales hardcodeadas
- [ ] Sin secrets en código
- [ ] SERVICE_ROLE_KEY nunca expuesto en cliente

---

## 📊 TRACKING DE PROGRESO

### Fase 1: Críticas ⬜ 0/2
- [ ] **C1:** Rate Limiting
- [ ] **C2:** Política de Contraseñas

### Fase 2: Altas ⬜ 0/3
- [ ] **A1:** Protección CSRF
- [ ] **A2:** Session Timeouts
- [ ] **A3:** Eliminar Credenciales

### Fase 3: Medias ⬜ 0/3
- [ ] **M1:** Validación de Email
- [ ] **M2:** Mensajes de Error
- [ ] **M3:** Revisión XSS

### Fase 4: Validación ⬜ 0/1
- [ ] Testing completo y documentación

---

## 🚀 COMANDOS ÚTILES

### Desarrollo
```bash
# Iniciar proyecto
npm run dev

# Aplicar migración
npx supabase migration up

# Seed usuarios de prueba
npm run seed:dev

# Tests de seguridad
npm run test:security
```

### Verificación
```bash
# Buscar credenciales hardcodeadas
grep -r "password.*=" src/
grep -r "@europa.com" src/

# Verificar .gitignore
git check-ignore .env.local

# Ver historial de archivos sensibles
git log --all --full-history -- .env.local
```

### Deploy
```bash
# Build local
npm run build

# Deploy a Vercel
vercel --prod

# Verificar variables de entorno
vercel env ls
```

---

## 📞 CONTACTO Y SOPORTE

**Responsable de seguridad:** [Tu nombre]  
**Revisiones de código:** Requeridas para Fase 1 y 2  
**Aprobación final:** Requerida antes de merge a main  

---

## 📝 NOTAS

### Decisiones Técnicas
- **Rate Limiting:** Elegimos Supabase Edge Function sobre Vercel KV para evitar dependencias externas
- **CSRF:** Usamos validación de headers Origin/Referer en lugar de tokens por simplicidad
- **Sesiones:** Timeout de 15 minutos balanceado entre seguridad y UX

### Riesgos Conocidos
- Rate limiting puede ser bypasseado con múltiples IPs (mitigación: limitar por email también)
- Session timeout puede ser molesto para usuarios (mitigación: warning 2 min antes)

### Recursos Externos
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [Supabase Auth Security Best Practices](https://supabase.com/docs/guides/auth)
- [Next.js Security Headers](https://nextjs.org/docs/advanced-features/security-headers)

---

**Última actualización:** 21 de noviembre de 2025  
**Versión:** 1.0  
**Estado:** 📋 Listo para comenzar implementación
