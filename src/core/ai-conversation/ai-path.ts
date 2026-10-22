import type { ProcessedResponse } from '@/core/conversation/message-processor';
import type { TurnFacts } from './turn-message-builder';
import { formatAppointmentDateWithHint, formatSlotRange } from '@/core/appointment/appointment-text';

export type AiPathDecision =
  | { use: true }
  | { use: false; reason: 'disabled' | 'flow_response' | 'appointment_flow' | 'awaiting_advisor_name' };

export interface AiPathGateDependencies {
  settings(): Promise<{ enabled: boolean }>;
  appointmentFlowState(userId: string): Promise<string | null>;
  awaitingAdvisorName(userId: string): Promise<boolean>;
}

/**
 * Primera etapa, sin tocar al usuario: el interruptor. Se prueba con la IA
 * encendida en el entorno local, así que no hace falta acotarla por teléfono.
 */
export async function decideAiAccess(deps: AiPathGateDependencies): Promise<AiPathDecision> {
  const { enabled } = await deps.settings();
  return enabled ? { use: true } : { use: false, reason: 'disabled' };
}

/**
 * Segunda etapa, ya con el usuario y el bot activo: cualquier flujo en curso cede el
 * turno al camino léxico. Va de lo más barato a lo más caro de comprobar:
 * respuesta de WhatsApp Flow, flujo de cita y captura del nombre para el asesor.
 *
 * Cualquier estado del flujo de cita distinto de `completed` cuenta, incluido
 * `pending_auto_offer`: esa oferta la hizo el bot léxico con sus botones y quien la
 * contesta es el mismo código.
 */
export async function decideAiFlow(userId: string, hasFlowResponse: boolean, deps: AiPathGateDependencies): Promise<AiPathDecision> {
  if (hasFlowResponse) return { use: false, reason: 'flow_response' };
  const flowState = await deps.appointmentFlowState(userId);
  if (flowState !== null && flowState !== 'completed') return { use: false, reason: 'appointment_flow' };
  if (await deps.awaitingAdvisorName(userId)) return { use: false, reason: 'awaiting_advisor_name' };
  return { use: true };
}

export async function createGateDependencies(): Promise<AiPathGateDependencies> {
  const [{ configRepository }, { userRepository }] = await Promise.all([
    import('@/data/repositories/config.repository'), import('@/data/repositories/user.repository'),
  ]);
  return {
    // Sin caché: apagar el interruptor desde el panel tiene que valer en el siguiente mensaje.
    settings: async () => {
      const values = await configRepository.getMany(['ai_enabled']);
      return { enabled: values.ai_enabled?.toLowerCase() === 'true' };
    },
    appointmentFlowState: userId => userRepository.getAppointmentFlowState(userId),
    awaitingAdvisorName: userId => userRepository.isAwaitingAdvisorName(userId),
  };
}

/** Hechos del turno que no son estado de la conversación: reloj, anuncio de origen y cita vigente. */
export async function buildTurnFacts(userId: string, referralAdId?: string): Promise<TurnFacts> {
  const [{ scopeRepository, ROOT_SCOPE_ID }, { scopeRoutingRepository }, { appointmentRepository }] = await Promise.all([
    import('@/data/repositories/scope.repository'), import('@/data/repositories/scope-routing.repository'),
    import('@/data/repositories/appointment.repository'),
  ]);
  const adScopeId = referralAdId ? await scopeRoutingRepository.findActiveScopeByAd(referralAdId) : null;
  const [scopes, reachable] = await Promise.all([scopeRepository.getScopes(), scopeRepository.getReachableScopeIds()]);
  const active = await appointmentRepository.getActiveInScopes(userId, Array.from(reachable));
  return {
    now: new Date(),
    adOrigin: adScopeId ? scopes.find(scope => scope.id === adScopeId)?.name ?? null : null,
    hasActiveAppointment: active !== null,
    appointment: active && {
      date: formatAppointmentDateWithHint(active.requested_date),
      hours: formatSlotRange(active.time_slot_start, active.time_slot_end),
      development: active.scope_id === ROOT_SCOPE_ID ? null : scopes.find(scope => scope.id === active.scope_id)?.name ?? null,
      visitorName: active.visitor_name,
    },
    shouldOfferAppointment: false,
  };
}

export type AiTurnOutcome =
  | { kind: 'handled'; response: ProcessedResponse }
  | { kind: 'lexical'; afterSend?: Promise<void> };

/**
 * Camino con IA de un mensaje. `lexical` pide al procesador correr su camino de siempre
 * con el mismo mensaje (fallback del contestador); un duplicado no responde.
 */
export async function runAiTurn(
  input: { userId: string; phoneNumber: string; messageId: string; messageText: string; referralAdId?: string; suppressExternalMessages?: boolean }
): Promise<AiTurnOutcome> {
  try {
    const { handleAiMessage } = await import('./ai-message-handler');
    const facts = await buildTurnFacts(input.userId, input.referralAdId);
    const result = await handleAiMessage({ ...input, facts });
    if (result.kind === 'duplicate') {
      return { kind: 'handled', response: { responses: [], shouldSend: false, wasDetected: false, isFallback: false, viaAi: true } };
    }
    if (result.kind === 'fallback') return { kind: 'lexical', afterSend: result.afterSend };
    return { kind: 'handled', response: { ...result.response, viaAi: true } };
  } catch (error) {
    // Nada de lo previo al contestador debe dejar al lead sin respuesta: el bot léxico contesta.
    console.error('Falló el camino con IA antes de contestar; responde el camino léxico:', error);
    return { kind: 'lexical' };
  }
}
