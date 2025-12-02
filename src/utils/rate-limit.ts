/**
 * Rate Limiting para Login
 * 
 * Previene ataques de fuerza bruta limitando intentos de login
 * - Máximo 5 intentos por email cada 15 minutos
 * - Usa funciones de PostgreSQL para atomicidad
 * - Compatible con el sistema de auth existente
 */

import { supabaseServer } from '@/services/supabase/server-client';

export interface RateLimitResult {
  allowed: boolean;
  attemptsRemaining: number;
  lockedUntil: Date | null;
  secondsUntilUnlock: number;
  message: string;
}

export interface FailedAttemptResult {
  isNowLocked: boolean;
  lockedUntil: Date | null;
  attemptsMade: number;
  message: string;
}

/**
 * Verificar si un email puede intentar login
 * LLAMAR ANTES de intentar autenticación
 */
export async function checkLoginAttempts(email: string): Promise<RateLimitResult> {
  try {
    const { data, error } = await supabaseServer.rpc('check_login_attempt', {
      p_email: email.toLowerCase()
    });

    if (error) {
      console.error('[RateLimit] Error checking attempts:', error);
      // En caso de error, permitir intento (fail-open para no bloquear usuarios)
      return {
        allowed: true,
        attemptsRemaining: 5,
        lockedUntil: null,
        secondsUntilUnlock: 0,
        message: ''
      };
    }

    const result = data?.[0] || data;
    
    if (!result?.is_allowed) {
      const minutes = Math.ceil((result.seconds_until_unlock || 0) / 60);
      return {
        allowed: false,
        attemptsRemaining: 0,
        lockedUntil: result.locked_until_ts ? new Date(result.locked_until_ts) : null,
        secondsUntilUnlock: result.seconds_until_unlock || 0,
        message: `Demasiados intentos fallidos. Intenta de nuevo en ${minutes} minuto${minutes !== 1 ? 's' : ''}.`
      };
    }

    return {
      allowed: true,
      attemptsRemaining: result.attempts_remaining ?? 5,
      lockedUntil: null,
      secondsUntilUnlock: 0,
      message: ''
    };

  } catch (error) {
    console.error('[RateLimit] Exception checking attempts:', error);
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
 * Registrar intento de login fallido
 * LLAMAR DESPUÉS de autenticación fallida
 */
export async function recordFailedAttempt(email: string): Promise<FailedAttemptResult> {
  try {
    const { data, error } = await supabaseServer.rpc('record_failed_login', {
      p_email: email.toLowerCase()
    });

    if (error) {
      console.error('[RateLimit] Error recording failed attempt:', error);
      return {
        isNowLocked: false,
        lockedUntil: null,
        attemptsMade: 0,
        message: ''
      };
    }

    const result = data?.[0] || data;
    
    if (result?.is_now_locked) {
      return {
        isNowLocked: true,
        lockedUntil: result.locked_until_ts ? new Date(result.locked_until_ts) : null,
        attemptsMade: result.attempts_made || 5,
        message: 'Has excedido el número máximo de intentos. Tu cuenta ha sido bloqueada temporalmente por 15 minutos.'
      };
    }

    const remaining = 5 - (result?.attempts_made || 0);
    return {
      isNowLocked: false,
      lockedUntil: null,
      attemptsMade: result?.attempts_made || 0,
      message: remaining > 0 
        ? `Credenciales incorrectas. Te quedan ${remaining} intento${remaining !== 1 ? 's' : ''}.`
        : ''
    };

  } catch (error) {
    console.error('[RateLimit] Exception recording failed attempt:', error);
    return {
      isNowLocked: false,
      lockedUntil: null,
      attemptsMade: 0,
      message: ''
    };
  }
}

/**
 * Resetear intentos de login después de éxito
 * LLAMAR DESPUÉS de autenticación exitosa
 */
export async function resetLoginAttempts(email: string): Promise<void> {
  try {
    await supabaseServer.rpc('reset_login_attempts', {
      p_email: email.toLowerCase()
    });
    console.log('[RateLimit] Attempts reset for:', email);
  } catch (error) {
    console.error('[RateLimit] Error resetting attempts:', error);
    // No throw - no queremos bloquear login exitoso
  }
}

/**
 * Formatear tiempo restante para UI
 */
export function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return '';
  
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  
  if (minutes > 0) {
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
  return `${secs} segundos`;
}
