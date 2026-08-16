import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { documentCompilerRepository } from '@/data/repositories/document-compiler.repository';
import { scopeRepository } from '@/data/repositories/scope.repository';
import { getAuthenticatedAdmin } from '@/lib/server/authenticated-admin';
import { removeCompilerMaterial, uploadCompilerMaterial } from '@/services/storage/compiler-material-storage';

const MAX_MATERIAL_BYTES = 25 * 1024 * 1024;
const MIME_KINDS = new Map<string, 'text' | 'pdf' | 'document'>([
  ['text/plain', 'text'],
  ['application/pdf', 'pdf'],
  ['application/msword', 'document'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'document'],
]);

const textInputSchema = z.object({
  scopeId: z.string().uuid(),
  text: z.string().trim().min(1).max(500_000),
  filename: z.string().trim().min(1).max(200).default('material.txt'),
});

export async function GET(request: NextRequest) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const [runs, scopes] = await Promise.all([
    documentCompilerRepository.listRuns(),
    scopeRepository.getScopes(),
  ]);
  return NextResponse.json({ runs, scopes: scopes.filter(scope => scope.is_active) });
}

export async function POST(request: NextRequest) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const contentType = request.headers.get('content-type') || '';
    let scopeId: string;
    let filename: string;
    let mimeType: string;
    let kind: 'text' | 'pdf' | 'document';
    let plainText: string | null = null;
    let storagePath: string | null = null;
    let bytes: Uint8Array;

    if (contentType.includes('application/json')) {
      const input = textInputSchema.parse(await request.json());
      scopeId = input.scopeId;
      filename = input.filename;
      mimeType = 'text/plain';
      kind = 'text';
      plainText = input.text;
      bytes = new TextEncoder().encode(input.text);
    } else {
      const form = await request.formData();
      const file = form.get('file');
      const rawScopeId = form.get('scopeId');
      if (!(file instanceof File) || typeof rawScopeId !== 'string') {
        return NextResponse.json({ error: 'Archivo y alcance son requeridos' }, { status: 400 });
      }
      if (file.size === 0 || file.size > MAX_MATERIAL_BYTES) {
        return NextResponse.json({ error: 'El archivo debe pesar entre 1 byte y 25 MB' }, { status: 400 });
      }
      const parsedScope = z.string().uuid().safeParse(rawScopeId);
      if (!parsedScope.success) return NextResponse.json({ error: 'Alcance inválido' }, { status: 400 });
      scopeId = parsedScope.data;
      if (!(await scopeRepository.isActiveScope(scopeId))) {
        return NextResponse.json({ error: 'El alcance no existe o está inactivo' }, { status: 400 });
      }
      filename = file.name;
      mimeType = file.type;
      const resolvedKind = MIME_KINDS.get(mimeType);
      if (!resolvedKind) {
        return NextResponse.json({ error: `Formato no admitido: ${mimeType || 'desconocido'}` }, { status: 415 });
      }
      kind = resolvedKind;
      bytes = new Uint8Array(await file.arrayBuffer());
      if (kind === 'text') plainText = new TextDecoder().decode(bytes);
      else {
        const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
        storagePath = `${scopeId}/${crypto.randomUUID()}_${safeName}`;
        await uploadCompilerMaterial(storagePath, bytes, mimeType);
      }
    }

    if (kind === 'text' && !(await scopeRepository.isActiveScope(scopeId))) {
      return NextResponse.json({ error: 'El alcance no existe o está inactivo' }, { status: 400 });
    }

    const checksum = createHash('sha256').update(bytes).digest('hex');
    try {
      const material = await documentCompilerRepository.createMaterial({
        scopeId, kind, filename, storagePath, mimeType, plainText, checksum, adminId: admin.id,
      });
      const run = await documentCompilerRepository.createRun(scopeId, material.id, admin.id);
      return NextResponse.json({ material, run }, { status: 201 });
    } catch (error) {
      if (storagePath) await removeCompilerMaterial(storagePath);
      throw error;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Material inválido' }, { status: 400 });
    }
    console.error('Error ingesting compiler material:', error);
    return NextResponse.json({ error: 'No fue posible conservar el material' }, { status: 500 });
  }
}
