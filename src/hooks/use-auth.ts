/**
 * Hook de autenticación
 * Re-exporta el contexto de autenticación para mantener compatibilidad
 * NOTA: La lógica real está en auth-context.tsx para evitar antipatrón de múltiples instancias
 */

'use client';

export { useAuth } from '@/contexts/auth-context';
