import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { CATALOG_VALUE_TYPES } from '@/data/models/catalog-value.model';
import { catalogValueRepository, formatCatalogValue } from '@/data/repositories/catalog-value.repository';
import { scopeRepository } from '@/data/repositories/scope.repository';
import { getAuthenticatedAdmin } from '@/lib/server/authenticated-admin';

const ROOT_SCOPE_ID = '00000000-0000-4000-8000-000000000001';

const createSchema = z.object({
  scopeId: z.string().uuid(),
  valueKey: z.string().trim().min(1, 'El nombre del dato no puede quedar vacío'),
  value: z.union([z.string(), z.number(), z.boolean()]),
  valueType: z.enum(CATALOG_VALUE_TYPES),
  unit: z.string().nullable().optional(),
});

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

export async function POST(request: NextRequest) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const input = createSchema.parse(await request.json());
    const value = await catalogValueRepository.createValue(
      input.scopeId,
      input.valueKey,
      { value: input.value, valueType: input.valueType, unit: input.unit },
      admin.id
    );
    return NextResponse.json({ value });
  } catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues[0]?.message || 'El dato no es válido'
      : error instanceof Error
        ? error.message
        : 'No fue posible guardar el dato';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
