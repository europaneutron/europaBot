import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { documentCompilerRepository } from '@/data/repositories/document-compiler.repository';
import { getAuthenticatedAdmin } from '@/lib/server/authenticated-admin';
import { intentDetectionService } from '@/core/intent-engine/intent-detection.service';

const actionSchema = z.object({
  action: z.enum(['approve', 'reject']),
  runId: z.string().uuid(),
  messageText: z.unknown().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { proposalId: string } }
) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    const input = actionSchema.parse(await request.json());
    if (input.action === 'approve') {
      await documentCompilerRepository.approveProposal(params.proposalId, admin.id, input.messageText);
      intentDetectionService.invalidateAll();
    } else {
      await documentCompilerRepository.rejectProposal(params.proposalId);
    }
    await documentCompilerRepository.completeRunIfReviewed(input.runId);
    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('Error reviewing compiler proposal:', error);
    return NextResponse.json({ error: 'No fue posible revisar la propuesta' }, { status: 500 });
  }
}
