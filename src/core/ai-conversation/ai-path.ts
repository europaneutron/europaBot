import type { ProcessedResponse } from '@/core/conversation/message-processor';
import type { TurnFacts } from './turn-message-builder';

export type AiPathDecision =
  | { use: true }
  | { use: false; reason: 'disabled' | 'invalid_allowlist' | 'phone_not_allowed' | 'flow_response' | 'appointment_flow' | 'awaiting_advisor_name' };

export interface AiPathGateDependencies {
  settings(): Promise<{ enabled: boolean; allowedPhonesRaw: string }>;
  appointmentFlowState(userId: string): Promise<string | null>;
  awaitingAdvisorName(userId: string): Promise<boolean>;
}

const digitsOf = (phone: string) => phone.replace(/\D/g, '');

/**
 * Los teléfonos se guardan como llegan de Meta (solo dígitos, con lada de país). Se
 * compara por dígitos y, ante números de México, por los últimos diez: Meta ha
 * entregado el mismo número como 52 y como 521, y una lista escrita a mano no
 * debería fallar por eso.
 */
export function phonesMatch(a: string, b: string): boolean {
  const left = digitsOf(a);
  const right = digitsOf(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return left.length >= 10 && right.length >= 10 && left.slice(-10) === right.slice(-10);
}

/** null cuando el valor no es una lista JSON: se trata como "nadie" para no abrir la IA a todos por un error de captura. */
export function parseAllowedPhones(raw: string): string[] | null {
  try {
    const parsed: unknown = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return null;
    return parsed.map(item => String(item).trim()).filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * Primera etapa, sin tocar al usuario: apagado y lista de teléfonos. Con la IA
 * apagada solo se lee `ai_enabled`.
 */
export async function decideAiAccess(phoneNumber: string, deps: AiPathGateDependencies): Promise<AiPathDecision> {
  const { enabled, allowedPhonesRaw } = await deps.settings();
  if (!enabled) return { use: false, reason: 'disabled' };
  const allowed = parseAllowedPhones(allowedPhonesRaw);
  if (allowed === null) {
    console.error('ai_allowed_phones no es una lista JSON; el camino con IA queda apagado para todos hasta corregirla.');
    return { use: false, reason: 'invalid_allowlist' };
  }
  if (allowed.length > 0 && !allowed.some(phone => phonesMatch(phone, phoneNumber))) {
    return { use: false, reason: 'phone_not_allowed' };
  }
  return { use: true };
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
      const values = await configRepository.getMany(['ai_enabled', 'ai_allowed_phones']);
      return { enabled: values.ai_enabled?.toLowerCase() === 'true', allowedPhonesRaw: values.ai_allowed_phones ?? '[]' };
    },
    appointmentFlowState: userId => userRepository.getAppointmentFlowState(userId),
    awaitingAdvisorName: userId => userRepository.isAwaitingAdvisorName(userId),
  };
}

/** Hechos del turno que no son estado de la conversación: reloj, anuncio de origen y cita vigente. */
export async function buildTurnFacts(userId: string, referralAdId?: string): Promise<TurnFacts> {
  const [{ scopeRepository }, { scopeRoutingRepository }, { appointmentRepository }] = await Promise.all([
    import('@/data/repositories/scope.repository'), import('@/data/repositories/scope-routing.repository'),
    import('@/data/repositories/appointment.repository'),
  ]);
  const adScopeId = referralAdId ? await scopeRoutingRepository.findActiveScopeByAd(referralAdId) : null;
  const [scopes, reachable] = await Promise.all([scopeRepository.getScopes(), scopeRepository.getReachableScopeIds()]);
  return {
    now: new Date(),
    adOrigin: adScopeId ? scopes.find(scope => scope.id === adScopeId)?.name ?? null : null,
    hasActiveAppointment: await appointmentRepository.hasActiveInScopes(userId, Array.from(reachable)),
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
