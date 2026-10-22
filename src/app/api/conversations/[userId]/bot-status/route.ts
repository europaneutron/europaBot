/**
 * POST - Silencia o reactiva el bot para un contacto. Silenciado, el bot sigue
 * guardando lo que el contacto escribe pero deja de contestarle.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedAdmin } from '@/lib/server/authenticated-admin';
import { userRepository } from '@/data/repositories/user.repository';

const paramsSchema = z.object({ userId: z.string().uuid('Contacto inválido') });
const requestSchema = z.object({ active: z.boolean() });

// Violación de llave foránea: el contacto no existe.
const FOREIGN_KEY_VIOLATION = '23503';

export async function POST(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  try {
    const { userId } = paramsSchema.parse(params);
    const { active } = requestSchema.parse(await request.json());
    const status = await userRepository.setBotActive(userId, active, { reason: 'muted_by_admin', adminId: admin.id });
    return NextResponse.json({ status });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Solicitud inválida' }, { status: 400 });
    }
    if ((error as { code?: string })?.code === FOREIGN_KEY_VIOLATION) {
      return NextResponse.json({ error: 'El contacto no existe' }, { status: 404 });
    }
    console.error('[BotStatus] No se pudo cambiar el estado del bot:', error);
    return NextResponse.json({ error: 'No se pudo cambiar el estado del bot' }, { status: 500 });
  }
}
