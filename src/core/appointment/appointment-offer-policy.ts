export interface AppointmentOfferPolicyInput {
  autoOfferEnabled: boolean;
  completedCheckpoints: number;
  requiredCheckpoints: number;
  isStrongSignal: boolean;
  alreadyOfferedInScope: boolean;
  isCoolingDown: boolean;
}

export function shouldOfferAppointment(input: AppointmentOfferPolicyInput): boolean {
  if (!input.autoOfferEnabled || input.alreadyOfferedInScope || input.isCoolingDown) {
    return false;
  }

  return input.isStrongSignal
    || input.completedCheckpoints >= input.requiredCheckpoints;
}
