import { supabaseServer } from '@/services/supabase/server-client';

const BUCKET = 'compiler-materials';

export async function uploadCompilerMaterial(
  path: string,
  bytes: Uint8Array,
  mimeType: string
): Promise<void> {
  const { error } = await supabaseServer.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: mimeType, upsert: false });
  if (error) throw error;
}

export async function removeCompilerMaterial(path: string): Promise<void> {
  const { error } = await supabaseServer.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

export async function createCompilerMaterialSignedUrl(
  path: string,
  expiresInSeconds: number
): Promise<string> {
  const { data, error } = await supabaseServer.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw error || new Error('No fue posible abrir el archivo conservado');
  }
  return data.signedUrl;
}

export async function getCompilerMaterialModelSource(
  path: string,
  mimeType: string
): Promise<{ file_url: string } | { file_data: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(supabaseUrl)) {
    return { file_url: await createCompilerMaterialSignedUrl(path, 15 * 60) };
  }

  // El proveedor externo no puede abrir una URL firmada de localhost. En el
  // stack local se conserva el mismo documento, pero se envía como base64.
  const { data, error } = await supabaseServer.storage.from(BUCKET).download(path);
  if (error || !data) throw error || new Error('No fue posible descargar el material local');
  const bytes = Buffer.from(await data.arrayBuffer());
  return { file_data: `data:${mimeType};base64,${bytes.toString('base64')}` };
}
