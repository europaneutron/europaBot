/**
 * POST - Texto de persona que recibirá el modelo con los valores del formulario,
 * sin guardarlos. Reutiliza `buildPersona` para que la vista previa no pueda
 * divergir de lo que de verdad llega al prompt.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedAdmin } from '@/lib/server/authenticated-admin';
import { clientBrandRepository } from '@/data/repositories/client-brand.repository';
import { buildPersona } from '@/core/ai-conversation/context-builder';
import {
  PERSONA_EMOJIS, PERSONA_LENGTHS, PERSONA_NAME_MAX_LENGTH, PERSONA_NOTES_MAX_LENGTH,
  PERSONA_REGISTERS, personaToConfig,
} from '@/lib/ai-persona';

const requestSchema = z.object({
  name: z.string().max(PERSONA_NAME_MAX_LENGTH),
  register: z.enum(PERSONA_REGISTERS),
  emojis: z.enum(PERSONA_EMOJIS),
  length: z.enum(PERSONA_LENGTHS),
  notes: z.string().max(PERSONA_NOTES_MAX_LENGTH),
});

export async function POST(request: NextRequest) {
  if (!await getAuthenticatedAdmin(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  try {
    const fields = requestSchema.parse(await request.json());
    const brand = await clientBrandRepository.get();
    return NextResponse.json({ persona: buildPersona(personaToConfig(fields), brand.business_name) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Solicitud inválida' }, { status: 400 });
    }
    console.error('[AI-Persona] No se pudo armar la vista previa:', error);
    return NextResponse.json({ error: 'No se pudo armar la vista previa' }, { status: 500 });
  }
}
