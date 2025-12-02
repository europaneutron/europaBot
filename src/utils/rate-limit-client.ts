/**
 * Rate Limiting Client Functions
 * 
 * Funciones para llamar al API de rate limiting desde el cliente
 * Usadas en auth-context.tsx
 */

import type { RateLimitResult, FailedAttemptResult } from './rate-limit';

/**
 * Verificar si un email puede intentar login (cliente)
 */
export async function checkLoginRateLimit(email: string): Promise<RateLimitResult> {
  try {
    const response = await fetch('/api/auth/rate-limit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'check', email })
    });

    if (!response.ok) {
      // Fail-open: permitir en caso de error
      return {
        allowed: true,
        attemptsRemaining: 5,
        lockedUntil: null,
        secondsUntilUnlock: 0,
        message: ''
      };
    }

    const data = await response.json();
    return {
      ...data,
      lockedUntil: data.lockedUntil ? new Date(data.lockedUntil) : null
    };

  } catch (error) {
    console.error('[RateLimit Client] Error checking:', error);
    // Fail-open
    return {
      allowed: true,
      attemptsRemaining: 5,
      lockedUntil: null,
      secondsUntilUnlock: 0,
      message: ''
    };
  }
}

/**
 * Registrar intento fallido (cliente)
 */
export async function recordFailedLoginAttempt(email: string): Promise<FailedAttemptResult> {
  try {
    const response = await fetch('/api/auth/rate-limit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'record-failed', email })
    });

    if (!response.ok) {
      return {
        isNowLocked: false,
        lockedUntil: null,
        attemptsMade: 0,
        message: ''
      };
    }

    const data = await response.json();
    return {
      ...data,
      lockedUntil: data.lockedUntil ? new Date(data.lockedUntil) : null
    };

  } catch (error) {
    console.error('[RateLimit Client] Error recording:', error);
    return {
      isNowLocked: false,
      lockedUntil: null,
      attemptsMade: 0,
      message: ''
    };
  }
}

/**
 * Resetear intentos después de login exitoso (cliente)
 */
export async function resetLoginRateLimit(email: string): Promise<void> {
  try {
    await fetch('/api/auth/rate-limit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset', email })
    });
  } catch (error) {
    console.error('[RateLimit Client] Error resetting:', error);
    // No throw - no queremos bloquear login exitoso
  }
}
