import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  MaterialIngestionError,
  materialIngestionService,
} from '@/core/document-compiler/material-ingestion.service';
import { documentCompilerRepository } from '@/data/repositories/document-compiler.repository';
import { getAuthenticatedAdmin } from '@/lib/server/authenticated-admin';
import { clientBrandRepository } from '@/data/repositories/client-brand.repository';
import { toClientVocabulary } from '@/core/onboarding/client-vocabulary';

const textInputSchema = z.object({
  scopeId: z.string().uuid(),
  text: z.string().trim().min(1).max(500_000),
  filename: z.string().trim().min(1).max(200).default('material.txt'),
});

export async function GET(request: NextRequest) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const [runs, brand, collisions] = await Promise.all([
    documentCompilerRepository.listRuns(),
    clientBrandRepository.get(),
    documentCompilerRepository.listResponseCollisions(),
  ]);
  return NextResponse.json({ runs, vocabulary: toClientVocabulary(brand), collisions });
}

export async function POST(request: NextRequest) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const input = textInputSchema.parse(await request.json());
      const result = await materialIngestionService.ingestText({
        scopeId: input.scopeId,
        text: input.text,
        filename: input.filename,
        adminId: admin.id,
      });
      return NextResponse.json(result, { status: 201 });
    }

    const form = await request.formData();
    const file = form.get('file');
    const rawScopeId = form.get('scopeId');
    if (!(file instanceof File) || typeof rawScopeId !== 'string') {
      return NextResponse.json({ error: 'Archivo y proyecto son requeridos' }, { status: 400 });
    }
    const scopeId = z.string().uuid().parse(rawScopeId);
    const result = await materialIngestionService.ingestFile({ scopeId, file, adminId: admin.id });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof MaterialIngestionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Material inválido' }, { status: 400 });
    }
    console.error('Error ingesting compiler material:', error);
    return NextResponse.json({ error: 'No fue posible conservar el material' }, { status: 500 });
  }
}
