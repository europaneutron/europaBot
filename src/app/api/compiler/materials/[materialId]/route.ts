import { NextRequest, NextResponse } from 'next/server';
import { documentCompilerRepository } from '@/data/repositories/document-compiler.repository';
import { getAuthenticatedAdmin } from '@/lib/server/authenticated-admin';
import { createCompilerMaterialSignedUrl } from '@/services/storage/compiler-material-storage';

export async function GET(
  request: NextRequest,
  { params }: { params: { materialId: string } }
) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    const material = await documentCompilerRepository.getMaterial(params.materialId);
    if (material.material_kind === 'text') {
      return new NextResponse(material.plain_text, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
    const signedUrl = await createCompilerMaterialSignedUrl(material.storage_path, 5 * 60);
    return NextResponse.redirect(signedUrl);
  } catch (error) {
    console.error('Error opening compiler material:', error);
    return NextResponse.json({ error: 'No fue posible abrir el material' }, { status: 500 });
  }
}
