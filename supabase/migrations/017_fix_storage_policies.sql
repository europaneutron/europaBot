-- ============================================
-- FIX: Políticas de Storage para bot-media
-- Corrige problemas de autenticación en upload
-- ============================================

-- Eliminar políticas existentes
DROP POLICY IF EXISTS "Public read access for bot media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload bot media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update bot media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete bot media" ON storage.objects;

-- 1. Política de lectura pública (sin cambios)
CREATE POLICY "Public read access for bot media"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'bot-media');

-- 2. Política de INSERT más permisiva (permite a usuarios autenticados)
CREATE POLICY "Authenticated users can upload bot media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'bot-media' 
  AND (storage.foldername(name))[1] IN ('images', 'documents', 'videos', 'brochures', '')
);

-- 3. Política de UPDATE (permite actualizar metadatos)
CREATE POLICY "Authenticated users can update bot media"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'bot-media')
WITH CHECK (bucket_id = 'bot-media');

-- 4. Política de DELETE (permite eliminar archivos)
CREATE POLICY "Authenticated users can delete bot media"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'bot-media');

-- Verificar que el bucket existe y está configurado correctamente
UPDATE storage.buckets
SET 
  public = true,
  file_size_limit = 104857600,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'video/mp4',
    'video/quicktime',
    'video/avi'
  ]
WHERE id = 'bot-media';
