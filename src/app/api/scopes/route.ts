/**
 * Los fraccionamientos, a mano.
 *
 * Hasta ahora un alcance solo nacia del onboarding, es decir del compilador:
 * quien queria dar de alta un desarrollo tecleando su nombre no tenia por
 * donde. Esta ruta es esa puerta, y el alias es parte del alta y no un extra:
 * sin el, el lead que escribe "Europa" no llega a "Europa Residencial".
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { ROOT_SCOPE_ID, scopeRepository } from '@/data/repositories/scope.repository';
import { scopeRoutingRepository } from '@/data/repositories/scope-routing.repository';
import { normalizeScopeAlias } from '@/core/onboarding/client-vocabulary';
import { shortScopeAlias } from '@/core/document-compiler/compiler-rules';
import { getAuthenticatedAdmin } from '@/lib/server/authenticated-admin';

const NAME_MAX_LENGTH = 60;

const createSchema = z.object({
  name: z.string().trim().min(2, 'El nombre necesita al menos dos letras').max(NAME_MAX_LENGTH),
  parentId: z.string().uuid().nullable().optional(),
  aliases: z.array(z.string()).optional(),
});

function slugFor(name: string): string {
  const base = normalizeScopeAlias(name).replace(/\s+/g, '-');
  return `${base || 'alcance'}-${randomUUID().slice(0, 8)}`;
}

/**
 * El nombre completo, lo que la persona escribio, y la forma corta que el lead
 * suele usar --"Europa" por "Europa Residencial"--. Duplicados fuera, que es
 * lo que hace `uniqueAliases` en el onboarding.
 */
function aliasesFor(name: string, extra: string[]): Array<{ alias: string; normalizedAlias: string }> {
  const candidates = [name, ...extra, shortScopeAlias(name) || ''];
  const byNormalized = new Map<string, string>();
  for (const candidate of candidates) {
    const alias = candidate.trim();
    const normalizedAlias = normalizeScopeAlias(alias);
    if (alias && normalizedAlias && !byNormalized.has(normalizedAlias)) {
      byNormalized.set(normalizedAlias, alias);
    }
  }
  return Array.from(byNormalized, ([normalizedAlias, alias]) => ({ alias, normalizedAlias }));
}

export async function GET(request: NextRequest) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const [scopes, aliases] = await Promise.all([
      scopeRepository.getScopes(),
      scopeRoutingRepository.getAllAliases(),
    ]);
    const aliasesByScope = new Map<string, string[]>();
    for (const alias of aliases) {
      const list = aliasesByScope.get(alias.scope_id) || [];
      list.push(alias.alias);
      aliasesByScope.set(alias.scope_id, list);
    }
    return NextResponse.json({
      rootScopeId: ROOT_SCOPE_ID,
      scopes: scopes.map(scope => ({
        ...scope,
        aliases: aliasesByScope.get(scope.id) || [],
      })),
    });
  } catch (error) {
    console.error('Error loading scopes:', error);
    return NextResponse.json({ error: 'No fue posible cargar los alcances' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const input = createSchema.parse(await request.json());
    const parentId = input.parentId === undefined ? ROOT_SCOPE_ID : input.parentId;

    const existing = await scopeRepository.getScopes();
    const normalizedName = normalizeScopeAlias(input.name);
    if (existing.some(scope => normalizeScopeAlias(scope.name) === normalizedName)) {
      return NextResponse.json(
        { error: `Ya existe un alcance llamado "${input.name}"` },
        { status: 400 }
      );
    }

    const scope = await scopeRepository.create({
      name: input.name.trim(),
      slug: slugFor(input.name),
      parent_id: parentId,
      // Un alcance dado de alta a mano nace encendido: quien lo escribe lo
      // quiere ahora. Los del compilador nacen apagados porque esperan una
      // aprobacion, que aqui no existe.
      is_active: true,
    });

    await scopeRoutingRepository.createAliases(
      scope.id,
      aliasesFor(input.name, input.aliases || [])
    );

    return NextResponse.json({ scope });
  } catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues[0]?.message || 'Los datos no son válidos'
      : error instanceof Error
        ? error.message
        : 'No fue posible crear el alcance';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
