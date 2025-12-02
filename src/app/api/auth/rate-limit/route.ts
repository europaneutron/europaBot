/**
 * API Route para Rate Limiting de Login
 * 
 * Usa service role para acceder a las funciones de rate limiting
 * Llamado desde el cliente antes/después de intentos de login
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkLoginAttempts, recordFailedAttempt, resetLoginAttempts } from '@/utils/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, email } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email requerido' },
        { status: 400 }
      );
    }

    // Validar formato básico de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Email inválido' },
        { status: 400 }
      );
    }

    switch (action) {
      case 'check': {
        const result = await checkLoginAttempts(email);
        return NextResponse.json(result);
      }

      case 'record-failed': {
        const result = await recordFailedAttempt(email);
        return NextResponse.json(result);
      }

      case 'reset': {
        await resetLoginAttempts(email);
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json(
          { error: 'Acción no válida' },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('[API/RateLimit] Error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
