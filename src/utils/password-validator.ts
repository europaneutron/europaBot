/**
 * Password Validator
 * 
 * Valida contraseñas según los requisitos de seguridad:
 * - Mínimo 12 caracteres
 * - Al menos 1 mayúscula
 * - Al menos 1 minúscula
 * - Al menos 1 número
 * - Al menos 1 caracter especial
 */

export interface PasswordValidationResult {
  isValid: boolean;
  score: number; // 0-5
  errors: string[];
  requirements: {
    minLength: boolean;
    hasUppercase: boolean;
    hasLowercase: boolean;
    hasNumber: boolean;
    hasSpecialChar: boolean;
  };
}

const MIN_PASSWORD_LENGTH = 12;
const SPECIAL_CHARS_REGEX = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/;

/**
 * Validar contraseña y retornar resultado detallado
 */
export function validatePassword(password: string): PasswordValidationResult {
  const requirements = {
    minLength: password.length >= MIN_PASSWORD_LENGTH,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecialChar: SPECIAL_CHARS_REGEX.test(password)
  };

  const errors: string[] = [];
  let score = 0;

  if (!requirements.minLength) {
    errors.push(`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`);
  } else {
    score++;
    // Bonus por longitud extra
    if (password.length >= 16) score += 0.5;
  }

  if (!requirements.hasUppercase) {
    errors.push('Al menos una letra mayúscula');
  } else {
    score++;
  }

  if (!requirements.hasLowercase) {
    errors.push('Al menos una letra minúscula');
  } else {
    score++;
  }

  if (!requirements.hasNumber) {
    errors.push('Al menos un número');
  } else {
    score++;
  }

  if (!requirements.hasSpecialChar) {
    errors.push('Al menos un caracter especial (!@#$%^&*...)');
  } else {
    score++;
  }

  return {
    isValid: errors.length === 0,
    score: Math.min(5, score),
    errors,
    requirements
  };
}

/**
 * Obtener clase de color basado en score
 */
export function getPasswordStrengthColor(score: number): string {
  if (score <= 1) return 'bg-red-500';
  if (score <= 2) return 'bg-orange-500';
  if (score <= 3) return 'bg-yellow-500';
  if (score <= 4) return 'bg-lime-500';
  return 'bg-green-500';
}

/**
 * Obtener texto de fuerza basado en score
 */
export function getPasswordStrengthText(score: number): string {
  if (score <= 1) return 'Muy débil';
  if (score <= 2) return 'Débil';
  if (score <= 3) return 'Media';
  if (score <= 4) return 'Fuerte';
  return 'Muy fuerte';
}

/**
 * Check common weak passwords (lista reducida)
 */
const COMMON_WEAK_PASSWORDS = [
  'password123!',
  '123456789012',
  'qwerty123456',
  'admin12345678',
  'letmein12345',
  'welcome12345'
];

export function isCommonPassword(password: string): boolean {
  return COMMON_WEAK_PASSWORDS.includes(password.toLowerCase());
}
