import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { CATALOG_VALUE_TYPES } from '@/data/models/catalog-value.model';
import { catalogValueRepository } from '@/data/repositories/catalog-value.repository';
import { getAuthenticatedAdmin } from '@/lib/server/authenticated-admin';

const updateSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean()]),
  valueType: z.enum(CATALOG_VALUE_TYPES),
  unit: z.string().nullable().optional(),
});

export async function DELETE(
  request: NextRequest,
  { params }: { params: { valueId: string } }
) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    await catalogValueRepository.deleteValue(params.valueId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible borrar el dato';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { valueId: string } }
) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const input = updateSchema.parse(await request.json());
    const value = await catalogValueRepository.updateValue(params.valueId, input, admin.id);
    return NextResponse.json({ value });
  } catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues[0]?.message || 'El valor no es válido'
      : error instanceof Error
        ? error.message
        : 'No fue posible guardar el valor';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
