import { appointmentManager } from '@/core/appointment/appointment-manager';
import { fallbackHandler } from '@/core/fallback/fallback-handler';
import { resourceRepository, type Resource } from '@/data/repositories/resource.repository';
import { scopeRepository, ROOT_SCOPE_ID } from '@/data/repositories/scope.repository';
import { conversationRepository, type ContextResponseRow } from '@/data/repositories/conversation.repository';
import { appointmentRepository } from '@/data/repositories/appointment.repository';
import { withContentVersionScope } from '@/lib/server/content-version-scope';
import type { BotResponse } from '@/types/message-fragments.types';
import type { ToolActions } from './tools';
import { documentResponse, resolveBrochureDocuments } from './brochure';

export function resourceResponses(resources: Resource[]): BotResponse[] {
  return resources.flatMap((resource): BotResponse[] => {
    const url = resource.file_url || resource.external_url;
    if (!url) return [];
    if (!resource.file_url) return [`${resource.title}: ${url}`];
    const mediaType = resource.mime_type?.startsWith('image/') || resource.resource_type === 'image' ? 'image'
      : resource.mime_type?.startsWith('video/') || resource.resource_type === 'video' ? 'video' : 'document';
    return [{ text: resource.title, media_url: url, media_type: mediaType }];
  });
}

/** Mismas reglas que el contexto: recursos visibles o, si no hay, documentos de una respuesta del alcance o sus ancestros. */
async function loadBrochureResponses(scopeId: string, loaded?: ContextResponseRow[]): Promise<BotResponse[]> {
  const resources = resourceResponses(await resourceRepository.getVisible(scopeId));
  if (resources.length) return resources;
  const [rows, order] = await Promise.all([
    loaded ?? conversationRepository.getContextResponseRows(), scopeRepository.getResolutionOrder(scopeId),
  ]);
  const chain = order.filter((id): id is string => id !== null);
  return documentResponse(resolveBrochureDocuments(chain, id => rows.filter(row => row.scope_id === id)));
}

export function createToolActions(input: { userId: string; phoneNumber: string; suppressExternalMessages?: boolean }): ToolActions {
  const response = (responses: BotResponse[], scopeId: string) => ({
    responses, scopeId, shouldSend: responses.length > 0,
    wasDetected: true, isFallback: false, flowHandled: true,
  });
  return {
    // Una versión nueva detecta ediciones hechas mientras respondía el proveedor.
    loadDevelopments: () => withContentVersionScope(async () => {
      const scopes = await scopeRepository.getScopes();
      const reachable = await scopeRepository.getReachableScopeIds();
      const rows = await conversationRepository.getContextResponseRows();
      return Promise.all(scopes.filter(scope => scope.parent_id === ROOT_SCOPE_ID && reachable.has(scope.id))
        .map(async scope => ({
          id: scope.id, name: scope.name,
          hasResources: (await loadBrochureResponses(scope.id, rows)).length > 0,
          hasAppointments: (await appointmentRepository.getTimeSlots(scope.id)).length > 0,
        })));
    }),
    async appointment(scopeId) {
      // En simulación se ejercita la máquina de estados sin enviar el formulario nativo.
      if (process.env.APPOINTMENT_FLOW_MODE === 'whatsapp_flow' && !input.suppressExternalMessages) {
        await appointmentManager.startFlowViaWhatsAppFlow(input.userId, input.phoneNumber, scopeId);
        return response([], scopeId);
      }
      const flow = await appointmentManager.startFlow(input.userId, true, scopeId);
      return response([flow.message], scopeId);
    },
    async advisor(scopeId = ROOT_SCOPE_ID) {
      const message = await fallbackHandler.startDerivation(input.userId, scopeId, { configureButtons: false });
      return response([message], scopeId);
    },
    async brochure(scopeId) {
      return loadBrochureResponses(scopeId);
    },
  };
}
