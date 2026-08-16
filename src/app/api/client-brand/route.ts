import { NextRequest, NextResponse } from 'next/server';
import { toClientVocabulary } from '@/core/onboarding/client-vocabulary';
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
