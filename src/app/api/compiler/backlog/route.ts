import { NextRequest, NextResponse } from 'next/server';
import { documentCompilerRepository } from '@/data/repositories/document-compiler.repository';
import { getAuthenticatedAdmin } from '@/lib/server/authenticated-admin';

export async function GET(request: NextRequest) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const scopeId = request.nextUrl.searchParams.get('scopeId') || undefined;
  try {
    return NextResponse.json({ backlog: await documentCompilerRepository.getFallbackBacklog(scopeId) });
  } catch (error) {
    console.error('Error loading compiler backlog:', error);
    return NextResponse.json({ error: 'No fue posible cargar los pendientes' }, { status: 500 });
  }
}
