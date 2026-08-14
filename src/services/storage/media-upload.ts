/**
 * Subida de archivos al bucket `bot-media`, usada por el editor de respuestas
 * para adjuntar varios archivos a la vez. Sigue el mismo esquema de carpetas
 * y validación de tipos que `MediaLibrary`.
 */

'use client';

import { createBrowserClient } from '@supabase/ssr';

export const ALLOWED_MEDIA_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'video/mp4',
  'video/quicktime',
];

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

export interface UploadedMediaFile {
  url: string;
  path: string;
  filename: string;
  mimeType: string;
}

function targetFolder(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'images/';
  if (mimeType.startsWith('video/')) return 'videos/';
  return 'documents/';
}

function getClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * Sube un archivo al bucket `bot-media`. Lanza un error con mensaje accionable
 * si el tipo MIME no está permitido o el archivo excede el tamaño máximo.
 */
export async function uploadMediaFile(file: File): Promise<UploadedMediaFile> {
  if (!ALLOWED_MEDIA_MIME_TYPES.includes(file.type)) {
    throw new Error(`Tipo de archivo no permitido: "${file.name}". Se aceptan imágenes, PDFs, documentos Word y videos.`);
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`"${file.name}" es demasiado grande. Máximo 100MB.`);
  }

  const supabase = getClient();
  const folder = targetFolder(file.type);
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const path = `${folder}${Date.now()}_${sanitizedName}`;

  const { error: uploadError } = await supabase.storage
    .from('bot-media')
    .upload(path, file, { cacheControl: '3600', upsert: false });

  if (uploadError) {
    throw new Error(`Error al subir "${file.name}": ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage.from('bot-media').getPublicUrl(path);

  return { url: urlData.publicUrl, path, filename: file.name, mimeType: file.type };
}

/**
 * Sube varios archivos. Los archivos con tipo no permitido u otro error se
 * reportan por separado sin descartar los que sí se suben correctamente.
 */
export async function uploadMediaFiles(
  files: File[]
): Promise<{ uploaded: UploadedMediaFile[]; errors: string[] }> {
  const uploaded: UploadedMediaFile[] = [];
  const errors: string[] = [];

  for (const file of files) {
    try {
      uploaded.push(await uploadMediaFile(file));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Error al subir "${file.name}"`);
    }
  }

  return { uploaded, errors };
}
