import { shouldOfferAppointment } from '@/core/appointment/appointment-offer-policy';

export interface OfferEvaluationDependencies {
  countCompletedTopics(userId: string): Promise<number>;
  alreadyOffered(userId: string): Promise<boolean>;
  isCoolingDown(userId: string): Promise<boolean>;
  settings(): Promise<{ requiredCheckpoints: number; autoOfferEnabled: boolean }>;
}

/**
 * Evalúa la oferta con lo que ya está guardado: los checkpoints del alcance raíz
 * que escriben las dos fuentes del score (matcher y clasificador). El mensaje en
 * curso no entra, porque el clasificador corre junto al contestador y puede no
 * haber terminado; ese tema cuenta desde el siguiente turno (design D10).
 */
export async function evaluateAppointmentOffer(
  userId: string, deps: OfferEvaluationDependencies, strongSignal = false
): Promise<boolean> {
  const [{ requiredCheckpoints, autoOfferEnabled }, completed, offered, cooling] = await Promise.all([
    deps.settings(), deps.countCompletedTopics(userId), deps.alreadyOffered(userId), deps.isCoolingDown(userId),
  ]);
  return shouldOfferAppointment({
    autoOfferEnabled, completedCheckpoints: completed, requiredCheckpoints,
    isStrongSignal: strongSignal, alreadyOfferedInScope: offered, isCoolingDown: cooling,
  });
}

export async function createOfferEvaluationDependencies(): Promise<OfferEvaluationDependencies> {
  const [{ userRepository }, { configRepository }, { ROOT_SCOPE_ID }] = await Promise.all([
    import('@/data/repositories/user.repository'),
    import('@/data/repositories/config.repository'),
    import('@/data/repositories/scope.repository'),
  ]);
  return {
    countCompletedTopics: userId => userRepository.countCompletedCheckpoints(userId, ROOT_SCOPE_ID),
    alreadyOffered: userId => userRepository.hasAppointmentBeenOffered(userId, ROOT_SCOPE_ID),
    isCoolingDown: async userId => userRepository.isAppointmentOfferCoolingDown(
      userId, await configRepository.getInt('appointment_offer_cooldown_hours', 168)),
    settings: async () => ({
      requiredCheckpoints: await configRepository.getInt('checkpoints_for_appointment', 4),
      autoOfferEnabled: await configRepository.getBoolean('appointment_auto_offer_enabled', true),
    }),
  };
}
