/**
 * Layout para el Dashboard
 * 
 * SEGURIDAD:
 * - Middleware verifica autorización ANTES de llegar aquí
 * - Si el usuario llega aquí, está autorizado (confiamos en middleware)
 * - NO duplicamos verificaciones de seguridad
 */

'use client';

import { useAuth } from '@/hooks/use-auth';
import { Sidebar } from '@/components/layout/sidebar';
import { MobileNav } from '@/components/layout/mobile-nav';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();

  // Middleware garantiza que solo usuarios autorizados llegan aquí
  // Solo mostramos loading si el estado inicial no está listo
  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex bg-background">
      {/* Sidebar Desktop */}
      <Sidebar />

      {/* Contenido Principal */}
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        {children}
      </main>

      {/* Mobile Navigation */}
      <MobileNav />
    </div>
  );
}
