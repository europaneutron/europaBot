import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { documentCompilerRepository } from '@/data/repositories/document-compiler.repository';
import { getAuthenticatedAdmin } from '@/lib/server/authenticated-admin';
import { intentDetectionService } from '@/core/intent-engine/intent-detection.service';

const resolutionSchema = z.discriminatedUnion('strategy', [
  z.object({
    intentId: z.string().uuid(),
    strategy: z.literal('combine'),
    responseIds: z.array(z.string().uuid()).min(2),
  }),
  z.object({
    intentId: z.string().uuid(),
    strategy: z.literal('keep'),
    keepResponseId: z.string().uuid(),
  }),
]);

export async function POST(request: NextRequest) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const input = resolutionSchema.parse(await request.json());
    await documentCompilerRepository.resolveResponseCollision(
      input.intentId,
      admin.id,
      input.strategy,
      input.strategy === 'keep' ? input.keepResponseId : undefined,
      input.strategy === 'combine' ? input.responseIds : undefined
    );
    intentDetectionService.invalidateAll();
    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('Error resolving response collision:', error);
    return NextResponse.json({ error: 'No fue posible resolver la colisión' }, { status: 500 });
  }
}
