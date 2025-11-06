/**
 * Niveles de fallback del bot
 */
export enum FallbackLevel {
  LEVEL_1 = 1,  // Primera vez que no entiende - pregunta de clarificación
  LEVEL_2 = 2,  // Segunda vez - menú más específico
  LEVEL_3 = 3   // Tercera vez o más - derivar a asesor
}

/**
 * Estados del flujo de derivación a asesor
 */
export enum AdvisorDerivedState {
  NOT_DERIVED = 'not_derived',
  PENDING_NAME = 'pending_name',
  DERIVED = 'derived'
}
