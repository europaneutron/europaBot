import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { documentCompilerRepository } from '@/data/repositories/document-compiler.repository';
import { getAuthenticatedAdmin } from '@/lib/server/authenticated-admin';
const actionSchema = z.object({
  action: z.enum(['save', 'reject']),
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
    if (input.action === 'save') {
      await documentCompilerRepository.updateProposal(params.proposalId, input.messageText);
    } else {
      await documentCompilerRepository.rejectProposal(params.proposalId);
    }
    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('Error reviewing compiler proposal:', error);
    return NextResponse.json({ error: 'No fue posible revisar la propuesta' }, { status: 500 });
  }
}
