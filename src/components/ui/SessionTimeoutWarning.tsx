/**
 * Session Timeout Warning Modal
 * 
 * Muestra cuando la sesión está por expirar
 * y permite al usuario extender o cerrar sesión.
 */

'use client';

import { formatSessionTime } from '@/hooks/use-session-timeout';

interface SessionTimeoutWarningProps {
  isOpen: boolean;
  secondsRemaining: number;
  onExtend: () => void;
  onLogout: () => void;
}

export function SessionTimeoutWarning({
  isOpen,
  secondsRemaining,
  onExtend,
  onLogout
}: SessionTimeoutWarningProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      
      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        {/* Icon */}
        <div className="mx-auto w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
          <svg 
            className="w-6 h-6 text-yellow-600" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" 
            />
          </svg>
        </div>

        {/* Title */}
        <h2 className="text-xl font-semibold text-gray-900 text-center mb-2">
          Sesión por expirar
        </h2>

        {/* Message */}
        <p className="text-gray-600 text-center mb-4">
          Tu sesión expirará en{' '}
          <span className="font-bold text-yellow-600">
            {formatSessionTime(secondsRemaining)}
          </span>
          {' '}por inactividad.
        </p>

        {/* Countdown bar */}
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-6">
          <div 
            className="h-full bg-yellow-500 transition-all duration-1000"
            style={{ 
              width: `${(secondsRemaining / 120) * 100}%` // 120 = 2 minutos
            }}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onLogout}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cerrar sesión
          </button>
          <button
            onClick={onExtend}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Continuar
          </button>
        </div>
      </div>
    </div>
  );
}
