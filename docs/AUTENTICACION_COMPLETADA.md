# Sistema de Autenticación - Documentación

**Fecha:** 5 de noviembre de 2025  
**Estado:** ✅ Completado  
**Fase:** 2.2 - Sistema de Autenticación

---

## 📋 Resumen

Sistema de autenticación completo implementado con Supabase Auth, incluyendo:
- Row Level Security (RLS) en todas las tablas
- Roles de usuario (super_admin, admin, agent, viewer)
- Protección de rutas con middleware
- Hook personalizado para manejo de sesión
- Interfaz de login

---

## 🔐 Credenciales de Acceso

### Usuario Super Admin (Desarrollo)
- **Email:** admin@europa.com
- **Password:** europa2025
- **Rol:** super_admin
- **Permisos:** Acceso total al sistema

⚠️ **IMPORTANTE:** Cambiar estas credenciales en producción

---

## 🏗️ Arquitectura

### 1. Base de Datos

#### Tabla: `admin_users`
```sql
CREATE TABLE admin_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255),
  role VARCHAR(20) DEFAULT 'agent',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

#### Roles Disponibles
- **super_admin**: Acceso total (configuración, intenciones, usuarios)
- **admin**: Gestión de usuarios y contenido
- **agent**: Ver conversaciones y actualizar citas
- **viewer**: Solo lectura

---

### 2. Row Level Security (RLS)

Todas las tablas tienen RLS habilitado:
- `users` (usuarios del bot)
- `conversations`
- `appointments`
- `intent_configurations`
- `bot_responses`
- `bot_config`
- `advisor_requests`
- `user_sessions`
- `user_progress`
- `intents_log`
- `scheduled_followups`
- `resources`

#### Política General
```sql
-- Usuarios autenticados y activos pueden leer según su rol
CREATE POLICY "Admin users can view ..."
  ON [tabla] FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

-- Service role (webhook) tiene acceso total
CREATE POLICY "Service role full access"
  ON [tabla] FOR ALL
  TO service_role
  USING (true);
```

---

### 3. Hook de Autenticación

**Ubicación:** `src/hooks/use-auth.ts`

```typescript
const { 
  user,           // Usuario de Supabase Auth
  adminUser,      // Datos de admin_users
  loading,        // Estado de carga
  isAuthenticated,// ¿Está autenticado?
  signIn,         // Función de login
  signOut,        // Función de logout
  hasRole         // Verificar rol
} = useAuth();
```

#### Ejemplo de uso:
```tsx
'use client';

import { useAuth } from '@/hooks/use-auth';

export default function MyPage() {
  const { adminUser, signOut } = useAuth();

  return (
    <div>
      <p>Hola {adminUser?.full_name}</p>
      <button onClick={signOut}>Salir</button>
    </div>
  );
}
```

---

### 4. Middleware de Protección

**Ubicación:** `middleware.ts` (raíz del proyecto)

Protege automáticamente las rutas:
- `/settings/*`
- `/intents/*`
- `/appointments/*`
- `/conversations/*`
- `/advisor-requests/*`
- `/users/*`
- `/analytics/*`

Si el usuario no está autenticado o no es admin activo, redirige a `/login`.

---

### 5. Páginas de Autenticación

#### Layout de Auth
**Ubicación:** `src/app/(auth)/layout.tsx`

Layout simple con fondo degradado para páginas de login.

#### Página de Login
**Ubicación:** `src/app/(auth)/login/page.tsx`

Características:
- Formulario de email/password
- Validación de campos
- Mensajes de error claros
- Redirección automática después del login
- Credenciales de prueba visibles en desarrollo

---

### 6. Layout del Dashboard

**Ubicación:** `src/app/(dashboard)/layout.tsx`

Características:
- Verificación de autenticación
- Header con navegación
- Información del usuario (nombre, rol)
- Botón de logout
- Loading state mientras carga sesión

---

## 🧪 Testing

### Script de Verificación
**Ubicación:** `scripts/test-auth-system.ts`

Ejecutar con:
```bash
npx tsx scripts/test-auth-system.ts
```

**Tests incluidos:**
1. ✅ Verificar tabla admin_users existe
2. ✅ Listar usuarios admin
3. ✅ Verificar RLS en tabla users
4. ✅ Verificar RLS en tabla bot_config
5. ✅ Login con credenciales correctas
6. ✅ Funciones de ayuda (is_admin_user, get_admin_role)

---

## 🔄 Flujo de Autenticación

```
1. Usuario visita /settings (ruta protegida)
   ↓
2. Middleware verifica sesión
   ↓
3. Si no hay sesión → Redirect a /login
   ↓
4. Usuario ingresa credenciales
   ↓
5. Supabase Auth valida
   ↓
6. Hook useAuth() verifica que es admin activo
   ↓
7. Si es admin → Acceso permitido
   Si no es admin → Logout y redirect a /login
```

---

## 📝 Funciones de Base de Datos

### `is_admin_user()`
Verifica si el usuario actual es un admin activo.

```sql
SELECT is_admin_user(); -- true/false
```

### `get_admin_role()`
Obtiene el rol del usuario actual.

```sql
SELECT get_admin_role(); -- 'super_admin' | 'admin' | 'agent' | 'viewer'
```

---

## 🚀 Próximos Pasos

1. **Gestión de Usuarios** (Fase futura)
   - Crear/editar usuarios admin desde dashboard
   - Cambiar roles
   - Desactivar usuarios

2. **Cambio de Contraseña**
   - Página de "Olvidé mi contraseña"
   - Cambio de contraseña desde perfil

3. **Logs de Auditoría**
   - Registrar acciones de admins
   - Ver historial de cambios

---

## ⚠️ Consideraciones de Seguridad

1. **Producción:**
   - Cambiar credenciales de admin@europa.com
   - Usar passwords fuertes
   - Habilitar 2FA en Supabase Dashboard

2. **Variables de Entorno:**
   - `SUPABASE_SERVICE_ROLE_KEY` debe mantenerse secreta
   - Solo usar en server-side o scripts de backend

3. **Tokens:**
   - Los JWT de Supabase expiran automáticamente
   - useAuth() maneja refresh tokens automáticamente

4. **RLS:**
   - Service role bypasses RLS (necesario para webhook)
   - Usuarios autenticados acceden según políticas

---

## 📊 Estado del Proyecto

**Fase 0:** ✅ Sistema de Configuración Dinámica (100%)  
**Fase 1:** ✅ Editor de Intenciones (100%)  
**Fase 2.1:** ✅ RLS y Seguridad (100%)  
**Fase 2.2:** ✅ Sistema de Autenticación (100%)

**Completado:** ~50% del plan total  
**Siguiente:** Fase 4.1 - Notificación al Asesor

---

**Última actualización:** 5 de noviembre de 2025
