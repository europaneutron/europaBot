/**
 * Middleware para proteger rutas del dashboard
 * Verificación SERVER-SIDE: única fuente de autorización
 * Cliente confía en esta verificación (no duplica queries)
 * 
 * SEGURIDAD:
 * - Headers de seguridad en todas las respuestas
 * - Verificación de sesión activa
 * - Admin verification via admin_users table
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Security headers para todas las respuestas
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function applySecurityHeaders(response: NextResponse): NextResponse {
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

export async function middleware(req: NextRequest) {
  // El matcher ya filtra las rutas, no necesitamos verificar publicPaths aquí
  
  let response = NextResponse.next({
    request: req,
  });

  // Aplicar security headers
  applySecurityHeaders(response);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Verificar usuario autenticado (valida con servidor de Supabase)
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  // Si no hay usuario autenticado, redirigir a login
  if (authError || !user) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('redirectedFrom', req.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Verificar que el usuario es admin activo
  // Esta es la ÚNICA verificación de autorización
  const { data: adminUser, error } = await supabase
    .from('admin_users')
    .select('id, role, is_active')
    .eq('id', user.id)
    .eq('is_active', true)
    .single();

  if (error || !adminUser) {
    console.error('[Middleware] Admin verification failed:', error?.message);
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = '/login';
    return NextResponse.redirect(redirectUrl);
  }

  // Usuario autorizado - permitir acceso
  return response;
}

// Configurar rutas protegidas
// Incluir tanto la ruta base como sub-rutas explícitamente
export const config = {
  matcher: [
    '/settings',
    '/settings/:path*',
    '/intents',
    '/intents/:path*',
    '/appointments',
    '/appointments/:path*',
    '/conversations',
    '/conversations/:path*',
    '/advisor-requests',
    '/advisor-requests/:path*',
    '/users',
    '/users/:path*',
    '/analytics',
    '/analytics/:path*',
  ],
};
