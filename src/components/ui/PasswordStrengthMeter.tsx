/**
 * Password Strength Meter Component
 * 
 * Muestra visualmente la fuerza de la contraseña
 * y los requisitos que faltan por cumplir.
 */

'use client';

import { useMemo } from 'react';
import { 
  validatePassword, 
  getPasswordStrengthColor, 
  getPasswordStrengthText 
} from '@/utils/password-validator';

interface PasswordStrengthMeterProps {
  password: string;
  showRequirements?: boolean;
}

export function PasswordStrengthMeter({ 
  password, 
  showRequirements = true 
}: PasswordStrengthMeterProps) {
  const validation = useMemo(() => validatePassword(password), [password]);
  
  if (!password) return null;

  const strengthColor = getPasswordStrengthColor(validation.score);
  const strengthText = getPasswordStrengthText(validation.score);
  const percentage = (validation.score / 5) * 100;

  return (
    <div className="mt-2 space-y-2">
      {/* Barra de progreso */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all duration-300 ${strengthColor}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className={`text-xs font-medium ${
          validation.score <= 2 ? 'text-red-600' : 
          validation.score <= 3 ? 'text-yellow-600' : 
          'text-green-600'
        }`}>
          {strengthText}
        </span>
      </div>

      {/* Lista de requisitos */}
      {showRequirements && validation.errors.length > 0 && (
        <ul className="text-xs text-gray-600 space-y-1">
          {validation.errors.map((error, index) => (
            <li key={index} className="flex items-center gap-1">
              <span className="text-red-400">✗</span>
              <span>{error}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Checklist de requisitos cumplidos */}
      {showRequirements && validation.isValid && (
        <div className="flex items-center gap-1 text-xs text-green-600">
          <span>✓</span>
          <span>Contraseña segura</span>
        </div>
      )}
    </div>
  );
}
