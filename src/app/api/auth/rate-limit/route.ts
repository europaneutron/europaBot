/**
 * API Route para Rate Limiting de Login
 * 
 * Usa service role para acceder a las funciones de rate limiting
 * Llamado desde el cliente antes/después de intentos de login
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
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

    // Validar formato basico de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Email invalido' },
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
        // Reset requiere sesion autenticada para evitar bypass de fuerza bruta
        const supabase = createServerClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          {
            cookies: {
              getAll() {
                return request.cookies.getAll();
              },
              setAll() {},
            },
          }
        );
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          return NextResponse.json(
            { error: 'No autorizado' },
            { status: 403 }
          );
        }
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
