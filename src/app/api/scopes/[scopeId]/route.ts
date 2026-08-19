/**
 * Renombrar un fraccionamiento, apagarlo o volverlo a encender.
 *
 * No hay borrado: las claves foraneas hacia `scopes` son RESTRICT, asi que un
 * alcance con contenido no se puede borrar --y esta bien, porque borrarlo se
 * llevaria por delante respuestas y datos--. Apagarlo lo retira de la
 * conversacion y se puede deshacer.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ROOT_SCOPE_ID, scopeRepository } from '@/data/repositories/scope.repository';
import { scopeRoutingRepository } from '@/data/repositories/scope-routing.repository';
import { normalizeScopeAlias } from '@/core/onboarding/client-vocabulary';
import { getAuthenticatedAdmin } from '@/lib/server/authenticated-admin';

const updateSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  isActive: z.boolean().optional(),
  aliases: z.array(z.string()).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { scopeId: string } }
) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const input = updateSchema.parse(await request.json());

    if (input.isActive === false && params.scopeId === ROOT_SCOPE_ID) {
      return NextResponse.json(
        { error: 'El negocio no se puede apagar: es la raíz de todo el contenido' },
        { status: 400 }
      );
    }

    if (input.name) {
      const existing = await scopeRepository.getScopes();
      const normalized = normalizeScopeAlias(input.name);
      if (existing.some(scope => scope.id !== params.scopeId && normalizeScopeAlias(scope.name) === normalized)) {
        return NextResponse.json(
          { error: `Ya existe un alcance llamado "${input.name}"` },
          { status: 400 }
        );
      }
      await scopeRepository.rename(params.scopeId, input.name.trim());
    }

    if (input.isActive !== undefined) {
      await scopeRepository.setActive(params.scopeId, input.isActive);
    }

    if (input.aliases) {
      await scopeRoutingRepository.replaceAliases(
        params.scopeId,
        input.aliases
          .map(alias => ({ alias: alias.trim(), normalizedAlias: normalizeScopeAlias(alias) }))
          .filter(item => item.alias && item.normalizedAlias)
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues[0]?.message || 'Los datos no son válidos'
      : error instanceof Error
        ? error.message
        : 'No fue posible guardar el alcance';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
