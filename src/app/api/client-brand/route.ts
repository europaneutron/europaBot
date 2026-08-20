import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { toClientVocabulary } from '@/core/messaging/client-brand';
import { clientBrandRepository } from '@/data/repositories/client-brand.repository';
import { getAuthenticatedAdmin } from '@/lib/server/authenticated-admin';

export async function GET(request: NextRequest) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    const brand = await clientBrandRepository.get();
    return NextResponse.json({ brand, vocabulary: toClientVocabulary(brand) });
  } catch (error) {
    console.error('Error loading client brand:', error);
    return NextResponse.json({ error: 'No fue posible cargar el vocabulario' }, { status: 500 });
  }
}

const updateSchema = z.object({
  businessName: z.string().trim().min(2, 'El nombre del negocio necesita al menos dos letras').max(80).optional(),
  projectSingular: z.string().trim().min(2).max(40).optional(),
  projectPlural: z.string().trim().min(2).max(40).optional(),
  tone: z.enum(['friendly', 'direct', 'formal']).optional(),
  useComposedGreeting: z.boolean().optional(),
});

/**
 * La identidad del negocio se editaba solo desde el recorrido guiado, que es
 * parte del compilador. Con el bot configurado a mano, eso dejaba sin sitio al
 * nombre del negocio, a como se llaman los proyectos --{project_singular} y
 * compania, que salen en los mensajes del sistema-- y al saludo compuesto.
 */
export async function PATCH(request: NextRequest) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const input = updateSchema.parse(await request.json());
    const brand = await clientBrandRepository.update({
      ...input,
      // Tocar la identidad a mano es configurarla: si no, el resto del sistema
      // la sigue tratando como pendiente y usa los valores por omision.
      configured: true,
    });
    return NextResponse.json({ brand, vocabulary: toClientVocabulary(brand) });
  } catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues[0]?.message || 'Los datos no son válidos'
      : error instanceof Error
        ? error.message
        : 'No fue posible guardar';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
