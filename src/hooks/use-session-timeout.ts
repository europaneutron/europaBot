/**
 * Session Timeout Hook
 * 
 * Detecta inactividad del usuario y cierra sesión automáticamente
 * después del tiempo configurado.
 * 
 * Configurable:
 * - IDLE_TIMEOUT: 30 minutos por defecto
 * - WARNING_BEFORE: 2 minutos antes de expirar muestra warning
 */

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/services/supabase/client';

// Configuración de tiempos (en milisegundos)
const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutos
const WARNING_BEFORE = 2 * 60 * 1000; // 2 minutos antes

interface UseSessionTimeoutOptions {
  enabled?: boolean;
  onWarning?: () => void;
  onTimeout?: () => void;
}

export function useSessionTimeout(options: UseSessionTimeoutOptions = {}) {
  const { 
    enabled = true, 
    onWarning, 
    onTimeout 
  } = options;
  
  const router = useRouter();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningRef = useRef<NodeJS.Timeout | null>(null);
  const [showWarning, setShowWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (warningRef.current) {
      clearTimeout(warningRef.current);
      warningRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const handleTimeout = useCallback(async () => {
    clearTimers();
    setShowWarning(false);
    
    console.log('[SessionTimeout] Session expired, logging out...');
    
    if (onTimeout) {
      onTimeout();
    }
    
    await supabase.auth.signOut();
    router.push('/login?reason=timeout');
  }, [clearTimers, onTimeout, router]);

  const showWarningAndStartCountdown = useCallback(() => {
    setShowWarning(true);
    setSecondsRemaining(Math.floor(WARNING_BEFORE / 1000));
    
    if (onWarning) {
      onWarning();
    }
    
    // Iniciar countdown
    countdownRef.current = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [onWarning]);

  const resetTimer = useCallback(() => {
    if (!enabled) return;
    
    clearTimers();
    setShowWarning(false);
    
    // Timer para mostrar warning
    warningRef.current = setTimeout(() => {
      showWarningAndStartCountdown();
    }, IDLE_TIMEOUT - WARNING_BEFORE);
    
    // Timer para cerrar sesión
    timeoutRef.current = setTimeout(() => {
      handleTimeout();
    }, IDLE_TIMEOUT);
  }, [enabled, clearTimers, handleTimeout, showWarningAndStartCountdown]);

  const extendSession = useCallback(() => {
    console.log('[SessionTimeout] Session extended by user');
    resetTimer();
  }, [resetTimer]);

  useEffect(() => {
    if (!enabled) return;

    // Eventos que indican actividad del usuario
    const activityEvents = [
      'mousedown',
      'mousemove',
      'keydown',
      'scroll',
      'touchstart',
      'click'
    ];

    // Throttle para no resetear en cada evento
    let lastActivity = Date.now();
    const THROTTLE_MS = 30000; // Solo resetear cada 30 segundos

    const handleActivity = () => {
      const now = Date.now();
      if (now - lastActivity > THROTTLE_MS) {
        lastActivity = now;
        if (!showWarning) {
          // Solo resetear si no estamos en warning mode
          resetTimer();
        }
      }
    };

    // Agregar listeners
    activityEvents.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Iniciar timer
    resetTimer();

    // Cleanup
    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
      clearTimers();
    };
  }, [enabled, resetTimer, clearTimers, showWarning]);

  return {
    showWarning,
    secondsRemaining,
    extendSession,
    logout: handleTimeout
  };
}

/**
 * Formatear segundos para display
 */
export function formatSessionTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
