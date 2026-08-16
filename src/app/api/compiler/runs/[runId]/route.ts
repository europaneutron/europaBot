import { NextRequest, NextResponse } from 'next/server';
import { documentCompilerRepository } from '@/data/repositories/document-compiler.repository';
import { documentCompilerService } from '@/core/document-compiler/document-compiler.service';
import { getAuthenticatedAdmin } from '@/lib/server/authenticated-admin';

export async function GET(
  request: NextRequest,
  { params }: { params: { runId: string } }
) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    return NextResponse.json(await documentCompilerRepository.getReview(params.runId));
  } catch (error) {
    console.error('Error loading compiler review:', error);
    return NextResponse.json({ error: 'No fue posible cargar el resultado' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { runId: string } }
) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const run = body.action === 'approve_tree'
      ? await documentCompilerRepository.approveTree(params.runId, admin.id)
      : await documentCompilerService.runNextStage(params.runId);
    return NextResponse.json({ run });
  } catch (error) {
    console.error('Error advancing compiler run:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No fue posible avanzar la compilación' },
      { status: 500 }
    );
  }
}
