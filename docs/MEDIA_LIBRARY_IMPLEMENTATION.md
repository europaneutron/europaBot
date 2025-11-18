# 📚 Plan de Implementación: Biblioteca de Medios

## Objetivo
Implementar un sistema completo de gestión de archivos multimedia para las respuestas del bot, similar a WordPress, integrando Supabase Storage con el panel de administración existente.

---

## 📋 Estado Actual

### ✅ Ya Existe
- Panel de administración en `/dashboard`
- Formulario de gestión de respuestas en `/intents/[intentId]/responses`
- Campo `media_url` en tabla `bot_responses`
- Campo `media_url` en formulario de respuestas (solo input de texto)
- Métodos `sendDocument()`, `sendImage()` en `message-sender.ts`

### ❌ Falta Implementar
- Bucket de Supabase Storage
- Políticas RLS para el storage
- Componente de biblioteca de medios (modal)
- Uploader de archivos con drag & drop
- Preview de archivos multimedia
- Lógica para procesar `media_url` al enviar mensajes
- Detección automática de tipo de archivo

---

## 🎯 Fases de Implementación

### **Fase 1: Configuración de Supabase Storage** ⏱️ 15 min

**Archivos a crear:**
- `supabase/migrations/016_media_storage_bucket.sql`

**Contenido de la migración:**
```sql
-- 1. Crear bucket público para archivos del bot
-- 2. Política de lectura pública (para que WhatsApp pueda descargar)
-- 3. Política de upload para usuarios autenticados
-- 4. Política de eliminación para usuarios autenticados
```

**Estructura de carpetas sugerida:**
```
bot-media/
├── images/        # JPG, PNG, WEBP
├── documents/     # PDF, DOCX
├── videos/        # MP4
└── brochures/     # PDFs de brochures
```

**Verificación:**
- [ ] Bucket creado en Supabase Dashboard
- [ ] Upload manual funcional desde Supabase UI
- [ ] URL pública accesible desde navegador

---

### **Fase 2: Componente de Biblioteca de Medios** ⏱️ 2-3 horas

**Archivo a crear:**
- `src/components/admin/MediaLibrary.tsx`

**Funcionalidades:**
1. **Modal con overlay**
   - Animaciones de entrada/salida
   - Cerrar con ESC o clic fuera

2. **Barra superior**
   - Búsqueda por nombre de archivo
   - Filtros por tipo (Todos | Imágenes | Documentos | Videos)
   - Selector de carpeta

3. **Área de upload**
   - Drag & drop visual
   - Botón "Subir archivo"
   - Validación de tipos permitidos
   - Progress bar de subida
   - Preview instantáneo

4. **Grid de archivos**
   - Thumbnails para imágenes
   - Iconos para documentos/videos
   - Nombre de archivo
   - Tamaño (KB/MB)
   - Fecha de subida
   - Hover actions: [👁️ Ver] [🗑️ Eliminar] [📋 Copiar URL]

5. **Footer del modal**
   - Contador de archivos seleccionados
   - Botón "Cancelar"
   - Botón "Seleccionar" (confirmar)

**Tecnologías:**
- React hooks (useState, useEffect)
- Supabase Client (`supabase.storage.from('bot-media')`)
- Tailwind CSS para estilos
- Heroicons para iconos

**API necesaria:**
```typescript
// Listar archivos
const { data, error } = await supabase.storage
  .from('bot-media')
  .list('images/', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

// Upload archivo
const { data, error } = await supabase.storage
  .from('bot-media')
  .upload(`images/${fileName}`, file);

// Obtener URL pública
const { data } = supabase.storage
  .from('bot-media')
  .getPublicUrl(`images/${fileName}`);

// Eliminar archivo
const { error } = await supabase.storage
  .from('bot-media')
  .remove([`images/${fileName}`]);
```

**Verificación:**
- [ ] Modal abre y cierra correctamente
- [ ] Upload de archivos funciona
- [ ] Grid muestra archivos existentes
- [ ] Eliminar archivo funciona
- [ ] Copiar URL al clipboard funciona

---

### **Fase 3: Integración con Formulario de Respuestas** ⏱️ 1 hora

**Archivo a modificar:**
- `src/app/(dashboard)/intents/[intentId]/responses/page.tsx`

**Cambios en el formulario:**

**Antes:**
```tsx
<input
  type="url"
  value={formData.media_url}
  placeholder="https://..."
/>
```

**Después:**
```tsx
<div className="space-y-2">
  <div className="flex gap-2">
    <input
      type="url"
      value={formData.media_url}
      placeholder="https://... o selecciona de la biblioteca"
      readOnly={selectedMedia !== null}
    />
    <button type="button" onClick={() => setShowMediaLibrary(true)}>
      📁 Biblioteca
    </button>
  </div>
  
  {formData.media_url && (
    <div className="preview">
      {/* Preview del archivo seleccionado */}
    </div>
  )}
</div>

{showMediaLibrary && (
  <MediaLibrary
    onSelect={(url) => {
      setFormData({ ...formData, media_url: url });
      setShowMediaLibrary(false);
    }}
    onClose={() => setShowMediaLibrary(false)}
  />
)}
```

**Nueva funcionalidad:**
- Botón "📁 Biblioteca de Medios" junto al input de URL
- Al seleccionar archivo, URL se llena automáticamente
- Preview visual del archivo seleccionado
- Opción de limpiar selección (botón ×)

**Verificación:**
- [ ] Botón abre modal de biblioteca
- [ ] Seleccionar archivo llena el campo URL
- [ ] Preview se muestra correctamente
- [ ] Guardar respuesta funciona con URL de Supabase
- [ ] URL puede editarse manualmente si es necesario

---

### **Fase 4: Procesamiento de `media_url` en Mensajes** ⏱️ 1-2 horas

**Archivos a modificar:**

#### 4.1. `src/data/repositories/conversation.repository.ts`

**Método a actualizar:** `getBotResponses()`

**Cambio:**
```typescript
// Antes: Solo retorna message_text
SELECT message_text, response_type, order_priority

// Después: Incluir media_url
SELECT message_text, media_url, response_type, order_priority
```

#### 4.2. `src/types/message-fragments.types.ts`

**Agregar nuevo tipo:**
```typescript
export interface SimpleResponseWithMedia {
  text: string;
  media_url?: string;
  media_type?: 'image' | 'document' | 'video';
}

export type BotResponse = 
  | string 
  | SimpleResponseWithMedia 
  | FragmentedResponse;
```

#### 4.3. `src/core/conversation/message-processor.ts`

**Lógica a implementar:**
```typescript
// 1. Detectar si la respuesta tiene media_url
// 2. Determinar tipo de archivo (por extensión o MIME type)
// 3. Enviar primero el texto (si existe)
// 4. Enviar el archivo con el método correcto:
//    - .jpg/.png/.webp → sendImage()
//    - .pdf/.docx → sendDocument()
//    - .mp4 → sendVideo()
```

**Utilidad para detectar tipo:**
```typescript
function getMediaType(url: string): 'image' | 'document' | 'video' | null {
  const ext = url.split('.').pop()?.toLowerCase();
  
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext || '')) return 'image';
  if (['pdf', 'doc', 'docx'].includes(ext || '')) return 'document';
  if (['mp4', 'mov', 'avi'].includes(ext || '')) return 'video';
  
  return null;
}
```

**Verificación:**
- [ ] Respuestas con `media_url` envían el archivo correctamente
- [ ] Imágenes se envían como imagen (no como documento)
- [ ] PDFs se envían como documento
- [ ] Texto + archivo se envían en secuencia
- [ ] Mensajes sin `media_url` funcionan igual que antes
- [ ] Test en página `/test` muestra el archivo
- [ ] WhatsApp real recibe el archivo correctamente

---

### **Fase 5: Mejoras Opcionales** ⏱️ 1-2 horas

**Características adicionales:**

1. **Compresión automática de imágenes**
   - Redimensionar imágenes grandes antes de subir
   - Convertir a WEBP para optimizar

2. **Caché de archivos**
   - Guardar lista de archivos en localStorage
   - Refrescar solo cuando sea necesario

3. **Carpetas personalizadas**
   - Permitir crear carpetas desde la UI
   - Organización por proyecto/campaña

4. **Estadísticas de uso**
   - Mostrar cuántas respuestas usan cada archivo
   - Avisar antes de eliminar si está en uso

5. **Edición de archivos**
   - Renombrar archivos
   - Mover entre carpetas
   - Actualizar metadata

---

## 📊 Checklist de Implementación

### Fase 1: Storage
- [ ] Crear migración SQL
- [ ] Ejecutar migración en Supabase
- [ ] Verificar bucket en dashboard
- [ ] Probar upload manual
- [ ] Verificar URL pública accesible

### Fase 2: Biblioteca de Medios
- [ ] Crear componente `MediaLibrary.tsx`
- [ ] Implementar modal con overlay
- [ ] Implementar barra de búsqueda
- [ ] Implementar filtros por tipo
- [ ] Implementar área de drag & drop
- [ ] Implementar grid de archivos
- [ ] Implementar preview de archivos
- [ ] Implementar eliminar archivo
- [ ] Implementar copiar URL
- [ ] Implementar selección de archivo
- [ ] Añadir loading states
- [ ] Añadir manejo de errores

### Fase 3: Integración Formulario
- [ ] Importar componente MediaLibrary
- [ ] Agregar botón "Biblioteca"
- [ ] Implementar estado para modal
- [ ] Implementar callback onSelect
- [ ] Implementar preview de archivo seleccionado
- [ ] Implementar botón para limpiar selección
- [ ] Permitir edición manual de URL
- [ ] Testing completo del formulario

### Fase 4: Procesamiento de Media
- [ ] Modificar `conversation.repository.ts`
- [ ] Actualizar tipos en `message-fragments.types.ts`
- [ ] Implementar función `getMediaType()`
- [ ] Modificar `message-processor.ts`
- [ ] Implementar lógica de envío de archivos
- [ ] Testing en `/test` page
- [ ] Testing en WhatsApp real
- [ ] Verificar que respuestas sin media funcionen igual

### Fase 5: Optimizaciones (Opcional)
- [ ] Compresión de imágenes
- [ ] Sistema de caché
- [ ] Carpetas personalizadas
- [ ] Estadísticas de uso
- [ ] Edición de archivos

---

## 🚀 Orden de Ejecución Recomendado

1. **Día 1 (4-5 horas):**
   - ✅ Fase 1: Migración SQL + verificación (15 min)
   - ✅ Fase 2: Componente MediaLibrary completo (3 horas)
   - ✅ Fase 3: Integración con formulario (1 hora)

2. **Día 2 (2-3 horas):**
   - ✅ Fase 4: Procesamiento de media en mensajes (2 horas)
   - ✅ Testing exhaustivo en test page y WhatsApp real (1 hora)

3. **Día 3 (Opcional - 1-2 horas):**
   - ✅ Fase 5: Mejoras y optimizaciones

---

## 📝 Notas Importantes

### Migración SQL
**⚠️ La migración SQL NO activa todo automáticamente:**

**Lo que SÍ hace la migración:**
- ✅ Crea el bucket `bot-media` en Supabase Storage
- ✅ Configura políticas RLS para lectura pública
- ✅ Configura políticas para upload/delete de usuarios autenticados
- ✅ Prepara la infraestructura de almacenamiento

**Lo que NO hace (requiere desarrollo):**
- ❌ NO crea el componente de UI
- ❌ NO actualiza el formulario de respuestas
- ❌ NO procesa los archivos al enviar mensajes
- ❌ NO añade la lógica de negocio

**Por lo tanto:**
La migración es solo el **primer paso** (Fase 1). Después hay que desarrollar las Fases 2, 3 y 4 para tener el sistema completo funcionando.

### Requisitos Técnicos
- Node.js 18+
- Supabase CLI (para migraciones)
- Acceso al proyecto de Supabase
- Permisos de admin en el dashboard

### Limitaciones de WhatsApp
- Archivos máximo 100MB
- Videos máximo 16MB
- Imágenes máximo 5MB (recomendado)
- Formatos soportados: JPG, PNG, PDF, MP4, DOCX

### Seguridad
- URLs de Supabase Storage son públicas pero no adivinables (UUID)
- RLS protege contra uploads no autorizados
- Solo admins pueden subir/eliminar archivos
- Cualquiera puede leer (necesario para WhatsApp)

---

## 🎯 Resultado Final Esperado

Un sistema completo donde:

1. **Admin puede:**
   - Abrir biblioteca de medios desde cualquier respuesta
   - Ver todos los archivos organizados por carpetas
   - Subir nuevos archivos con drag & drop
   - Seleccionar archivos existentes para reutilizar
   - Ver preview antes de confirmar
   - Eliminar archivos que ya no se usan

2. **Bot puede:**
   - Enviar respuestas con texto + archivo adjunto
   - Detectar automáticamente el tipo de archivo
   - Usar el método correcto de WhatsApp (image/document/video)
   - Reutilizar archivos en múltiples respuestas sin duplicar

3. **Usuario final recibe:**
   - Mensajes con archivos multimedia profesionales
   - Imágenes, PDFs, videos según corresponda
   - Experiencia fluida sin errores de formato

---

## 📞 Contacto y Soporte

Si algo falla durante la implementación:
- Verificar logs de Supabase Dashboard
- Verificar console del navegador (F12)
- Verificar respuesta de WhatsApp API
- Revisar políticas RLS del bucket

---

## ✅ Estado de Implementación

| Fase | Estado | Commit | Fecha |
|------|--------|--------|-------|
| Fase 1: Configuración Storage | ✅ Completada | `1535430` | 18 Nov 2025 |
| Fase 2: Componente MediaLibrary | ✅ Completada | `1535430` | 18 Nov 2025 |
| Fase 3: Integración con Formulario | ✅ Completada | `1535430` | 18 Nov 2025 |
| Fase 4: Procesamiento de Media | ✅ Completada | `073c782` | 18 Nov 2025 |
| Fase 5: Optimizaciones | ⏳ Pendiente | - | - |

### Cambios Implementados

**Fase 1-3** (Commit 1535430):
- Bucket `bot-media` creado con RLS policies
- Componente `MediaLibrary.tsx` completo (500+ líneas)
- Integración en formulario de respuestas
- Botón "📁 Biblioteca" funcional

**Fase 4** (Commit 073c782):
- Tipo `SimpleResponseWithMedia` agregado
- `conversation.repository.ts` incluye `media_url` en queries
- Método `detectMediaType()` implementado
- Webhook procesa y envía archivos automáticamente
- Soporte para imágenes, documentos y videos

### Próximos Pasos

- **Fase 5 (Opcional):** Compresión de imágenes, caché, estadísticas de uso
- **Pruebas:** Verificar funcionamiento end-to-end en producción
- **Documentación:** Capacitación de usuario para biblioteca de medios

---

**Fecha de creación:** 18 de noviembre de 2025  
**Última actualización:** 18 de noviembre de 2025  
**Versión:** 2.0  
**Estado:** 🎉 80% Implementado - Fase 4 completa, Fase 5 opcional
