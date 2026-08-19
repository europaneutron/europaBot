import { NextRequest, NextResponse } from 'next/server';
import { catalogValueRepository, formatCatalogValue } from '@/data/repositories/catalog-value.repository';
import { scopeRepository } from '@/data/repositories/scope.repository';
import { getAuthenticatedAdmin } from '@/lib/server/authenticated-admin';

const ROOT_SCOPE_ID = '00000000-0000-4000-8000-000000000001';

export async function GET(request: NextRequest) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const scopeId = request.nextUrl.searchParams.get('scopeId') || ROOT_SCOPE_ID;
    const [values, resolvedValues, scopes] = await Promise.all([
      catalogValueRepository.listForTree(scopeId),
      catalogValueRepository.getResolvedValues(scopeId),
      scopeRepository.getScopes(),
    ]);
    return NextResponse.json({
      scopeId,
      values,
      resolvedValues: resolvedValues.map(value => ({
        ...value,
        display_value: formatCatalogValue(value),
      })),
      scopes: scopes.filter(scope => scope.is_active),
    });
  } catch (error) {
    console.error('Error loading catalog values:', error);
    return NextResponse.json({ error: 'No fue posible cargar el catálogo' }, { status: 500 });
  }
}
