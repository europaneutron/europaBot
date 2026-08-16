import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  MaterialIngestionError,
  materialIngestionService,
} from '@/core/document-compiler/material-ingestion.service';
import { onboardingService } from '@/core/onboarding/onboarding.service';
import { getAuthenticatedAdmin } from '@/lib/server/authenticated-admin';

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start') }),
  z.object({
    action: z.literal('vocabulary'),
    singular: z.string().trim().min(1).max(80),
    plural: z.string().trim().min(1).max(80),
  }),
  z.object({
    action: z.literal('project'),
    name: z.string().trim().min(1).max(120),
    aliases: z.array(z.string().trim().min(1).max(160)).max(12).default([]),
  }),
  z.object({
    action: z.literal('visit_flow'),
    choice: z.enum(['decided', 'guided', 'unsure']),
    partNames: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  }),
  z.object({ action: z.literal('goal') }),
  z.object({ action: z.literal('tone'), tone: z.enum(['friendly', 'direct', 'formal']) }),
  z.object({
    action: z.literal('update_brand'),
    singular: z.string().trim().min(1).max(80),
    plural: z.string().trim().min(1).max(80),
    tone: z.enum(['friendly', 'direct', 'formal']),
  }),
]);

export async function GET(request: NextRequest) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    return NextResponse.json(await onboardingService.getState(admin.id));
  } catch (error) {
    console.error('Error loading onboarding:', error);
    return NextResponse.json({ error: 'No fue posible cargar el recorrido' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      const text = form.get('text');
      const state = await onboardingService.getState(admin.id);
      if (state.session.status !== 'in_progress' || !state.session.scope_id) {
        return NextResponse.json({ error: 'Primero agrega el proyecto' }, { status: 400 });
      }

      const result = file instanceof File && file.size > 0
        ? await materialIngestionService.ingestFile({
            scopeId: state.session.scope_id,
            file,
            adminId: admin.id,
          })
        : await materialIngestionService.ingestText({
            scopeId: state.session.scope_id,
            text: typeof text === 'string' ? text : '',
            filename: 'material.txt',
            adminId: admin.id,
          });
      await onboardingService.attachRun(admin.id, result.run.id);
      return NextResponse.json(result, { status: 201 });
    }

    const input = actionSchema.parse(await request.json());
    if (input.action === 'start') await onboardingService.startNew(admin.id);
    if (input.action === 'vocabulary') {
      await onboardingService.saveVocabulary(admin.id, input);
    }
    if (input.action === 'project') await onboardingService.saveProject(admin.id, input);
    if (input.action === 'visit_flow') await onboardingService.saveVisitFlow(admin.id, input);
    if (input.action === 'goal') await onboardingService.confirmGoal(admin.id);
    if (input.action === 'tone') await onboardingService.saveTone(admin.id, input.tone);
    if (input.action === 'update_brand') await onboardingService.updateBrand(input);
    return NextResponse.json(await onboardingService.getState(admin.id));
  } catch (error) {
    if (error instanceof MaterialIngestionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Respuesta invalida' },
        { status: 400 }
      );
    }
    console.error('Error updating onboarding:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No fue posible guardar la respuesta' },
      { status: 500 }
    );
  }
}
