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

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, signOut } = useAuth();

  // Middleware garantiza que solo usuarios autorizados llegan aquí
  // Solo mostramos loading si el estado inicial no está listo
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">EuropaBot Dashboard</h1>
            
            <div className="flex items-center space-x-6">
              <nav className="flex space-x-4">
                <a href="/settings" className="text-gray-600 hover:text-gray-900">
                  Settings
                </a>
                <a href="/intents" className="text-gray-600 hover:text-gray-900">
                  Intents
                </a>
                <a href="/appointments" className="text-gray-600 hover:text-gray-900">
                  Appointments
                </a>
              </nav>

              {/* Usuario y logout */}
              <div className="flex items-center space-x-4 border-l pl-4">
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">
                    {user.email}
                  </p>
                </div>
                <button
                  onClick={() => signOut()}
                  className="px-3 py-1 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                >
                  Salir
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Contenido principal */}
      <main className="py-6">
        {children}
      </main>
    </div>
  );
}
