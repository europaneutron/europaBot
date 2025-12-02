/**
 * Contexto de Autenticación SIMPLIFICADO
 * 
 * ARQUITECTURA:
 * - Middleware: Única fuente de autorización (verifica admin_users)
 * - Este contexto: Solo mantiene estado de sesión para UI
 * - NO verifica permisos (confía en middleware)
 * - NO consulta admin_users (evita queries duplicadas)
 * 
 * SEGURIDAD:
 * - Rate limiting: Máximo 5 intentos por email cada 15 minutos
 * - Bloqueo temporal después de intentos fallidos
 */

'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/services/supabase/client';
import type { User } from '@supabase/supabase-js';
import { 
  checkLoginRateLimit, 
  recordFailedLoginAttempt, 
  resetLoginRateLimit 
} from '@/utils/rate-limit-client';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ 
    success: boolean; 
    error: string | null;
    isLocked?: boolean;
    attemptsRemaining?: number;
  }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      try {
        // getUser() valida con el servidor de Supabase
        const { data: { user }, error } = await supabase.auth.getUser();
        
        if (!mounted) return;

        if (error) {
          console.error('[AuthContext] Error getting user:', error);
          setUser(null);
        } else {
          setUser(user);
        }
        
        setLoading(false);
      } catch (error) {
        console.error('[AuthContext] Error initializing:', error);
        if (mounted) {
          setUser(null);
          setLoading(false);
        }
      }
    }

    initAuth();

    // Escuchar cambios de sesión (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;
        
        console.log('[AuthContext] Session changed:', event);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string) {
    try {
      // 1. Verificar rate limiting ANTES de intentar auth
      const rateCheck = await checkLoginRateLimit(email);
      
      if (!rateCheck.allowed) {
        return { 
          success: false, 
          error: rateCheck.message,
          isLocked: true,
          attemptsRemaining: 0
        };
      }

      // 2. Intentar autenticación
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        // 3. Registrar intento fallido
        const failedResult = await recordFailedLoginAttempt(email);
        
        return { 
          success: false, 
          error: failedResult.message || error.message,
          isLocked: failedResult.isNowLocked,
          attemptsRemaining: 5 - failedResult.attemptsMade
        };
      }

      // 4. Login exitoso - resetear intentos
      await resetLoginRateLimit(email);

      // El middleware verificará si es admin cuando navegue
      setUser(data.user);
      return { success: true, error: null };
    } catch (error: any) {
      console.error('[AuthContext] Error signing in:', error);
      return { success: false, error: error.message };
    }
  }

  async function signOut() {
    try {
      await supabase.auth.signOut();
      setUser(null);
      router.push('/login');
    } catch (error) {
      console.error('[AuthContext] Error signing out:', error);
    }
  }

  const value: AuthContextType = {
    user,
    loading,
    signIn,
    signOut
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
