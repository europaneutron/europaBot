import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  MaterialIngestionError,
  materialIngestionService,
} from '@/core/document-compiler/material-ingestion.service';
import { onboardingService } from '@/core/onboarding/onboarding.service';
import { getAuthenticatedAdmin } from '@/lib/server/authenticated-admin';
import { ROOT_SCOPE_ID } from '@/data/repositories/scope.repository';

/**
 * `scopes.name` es `varchar(120)`. El limite es real, pero el mensaje que zod
 * genera solo es util para quien conoce el esquema: quien esta dando de alta un
 * producto necesita saber cuanto sobra, no el nombre del tipo de la columna.
 */
const NAME_MAX_LENGTH = 120;
const nameField = (label: string) => z
  .string()
  .trim()
  .min(1, `Escribe ${label}.`)
  .max(NAME_MAX_LENGTH, `${label} no puede pasar de ${NAME_MAX_LENGTH} caracteres. Usa un nombre corto: el detalle completo va en las respuestas.`);

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start') }),
  z.object({ action: z.literal('cancel') }),
  z.object({ action: z.literal('manual_setup') }),
  z.object({
    action: z.literal('vocabulary'),
    singular: z.string().trim().min(1).max(80),
    plural: z.string().trim().min(1).max(80),
  }),
  z.object({
    action: z.literal('project'),
    name: nameField('el nombre'),
    aliases: z.array(z.string().trim().min(1).max(160)).max(12).default([]),
  }),
  z.object({
    action: z.literal('visit_flow'),
    choice: z.enum(['decided', 'guided', 'unsure']),
    partNames: z.array(nameField('cada nombre')).max(30).default([]),
  }),
  z.object({ action: z.literal('goal') }),
  z.object({
    action: z.literal('confirm_structure'),
    projectName: nameField('el nombre principal'),
    partNames: z.array(nameField('cada nombre')).max(30).default([]),
    flatten: z.boolean().default(false),
  }),
  z.object({
    action: z.literal('identity'),
    businessName: nameField('el nombre del negocio'),
    singular: z.string().trim().min(1).max(80),
    plural: z.string().trim().min(1).max(80),
    greetingChoice: z.enum(['keep', 'composed']),
  }),
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
      if (state.session.status !== 'in_progress' || state.session.run_id) {
        return NextResponse.json({ error: 'Este recorrido ya tiene material' }, { status: 400 });
      }

      const result = file instanceof File && file.size > 0
        ? await materialIngestionService.ingestFile({
            scopeId: ROOT_SCOPE_ID,
            file,
            adminId: admin.id,
          })
        : await materialIngestionService.ingestText({
            scopeId: ROOT_SCOPE_ID,
            text: typeof text === 'string' ? text : '',
            filename: 'material.txt',
            adminId: admin.id,
          });
      await onboardingService.attachRun(admin.id, result.run.id);
      return NextResponse.json(result, { status: 201 });
    }

    const input = actionSchema.parse(await request.json());
    if (input.action === 'start') await onboardingService.startNew(admin.id);
    if (input.action === 'cancel') await onboardingService.cancel(admin.id);
    if (input.action === 'manual_setup') await onboardingService.chooseManualSetup(admin.id);
    if (input.action === 'vocabulary') {
      await onboardingService.saveVocabulary(admin.id, input);
    }
    if (input.action === 'project') await onboardingService.saveProject(admin.id, input);
    if (input.action === 'confirm_structure') {
      await onboardingService.confirmProposedStructure(admin.id, input);
    }
    if (input.action === 'visit_flow') await onboardingService.saveVisitFlow(admin.id, input);
    if (input.action === 'identity') await onboardingService.saveIdentity(admin.id, input);
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
