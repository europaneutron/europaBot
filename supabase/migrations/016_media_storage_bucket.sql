-- ============================================
-- MEDIA STORAGE BUCKET
-- Sistema de almacenamiento de archivos multimedia para respuestas del bot
-- ============================================

-- 1. Crear bucket público para archivos multimedia
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bot-media',
  'bot-media',
  true,
  104857600, -- 100MB máximo por archivo
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'video/mp4',
    'video/quicktime'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- 2. Política de lectura pública
-- Permite que cualquiera (incluyendo WhatsApp) pueda descargar archivos
CREATE POLICY "Public read access for bot media"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'bot-media');

-- 3. Política de upload para usuarios autenticados
-- Solo usuarios autenticados (admins) pueden subir archivos
CREATE POLICY "Authenticated users can upload bot media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'bot-media');

-- 4. Política de actualización para usuarios autenticados
-- Permite renombrar o actualizar metadata de archivos
CREATE POLICY "Authenticated users can update bot media"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'bot-media')
WITH CHECK (bucket_id = 'bot-media');

-- 5. Política de eliminación para usuarios autenticados
-- Solo usuarios autenticados pueden eliminar archivos
CREATE POLICY "Authenticated users can delete bot media"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'bot-media');

-- ============================================
-- COMENTARIOS Y DOCUMENTACIÓN
-- ============================================
-- Los comentarios de políticas se omiten por limitaciones de permisos
-- Políticas creadas:
-- - Public read access: Permite que WhatsApp descargue archivos
-- - Authenticated upload: Solo admins pueden subir archivos
-- - Authenticated update: Solo admins pueden actualizar metadata
-- - Authenticated delete: Solo admins pueden eliminar archivos
-- ============================================

-- ============================================
-- ESTRUCTURA DE CARPETAS SUGERIDA
-- ============================================
-- 
-- bot-media/
-- ├── images/          # Imágenes: JPG, PNG, WEBP, GIF
-- ├── documents/       # Documentos: PDF, DOCX
-- ├── videos/          # Videos: MP4, MOV
-- └── brochures/       # Brochures específicos del proyecto
--
-- Las carpetas se crean automáticamente al subir el primer archivo
-- ============================================

-- ============================================
-- VERIFICACIÓN
-- ============================================
-- Para verificar que el bucket se creó correctamente:
-- SELECT * FROM storage.buckets WHERE id = 'bot-media';
--
-- Para verificar las políticas:
-- SELECT * FROM pg_policies WHERE tablename = 'objects' AND policyname LIKE '%bot media%';
-- ============================================
