import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { conversationSimulatorRepository } from '@/data/repositories/conversation-simulator.repository';
import { getAuthenticatedAdmin } from '@/lib/server/authenticated-admin';

const requestSchema = z.object({ phoneNumber: z.string().trim().min(4).max(20) });

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!await getAuthenticatedAdmin(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { phoneNumber } = requestSchema.parse(await request.json());
    const userId = await conversationSimulatorRepository.reset(phoneNumber);
    return NextResponse.json({ success: true, userId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Teléfono inválido' }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Error interno';
    return NextResponse.json({ error: message }, { status: message.includes('no encontrado') ? 404 : 500 });
  }
}
