import { NextRequest, NextResponse } from 'next/server';
import { onboardingService } from '@/core/onboarding/onboarding.service';
import { getAuthenticatedAdmin } from '@/lib/server/authenticated-admin';

export async function POST(request: NextRequest) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    await onboardingService.advance(admin.id);
    return NextResponse.json(await onboardingService.getState(admin.id));
  } catch (error) {
    console.error('Error preparing onboarding content:', error);
    return NextResponse.json(
      { error: 'No pudimos preparar el contenido. Puedes volver a intentarlo.' },
      { status: 500 }
    );
  }
}
