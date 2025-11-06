/**
 * Middleware para proteger rutas del dashboard
 * Verificación SERVER-SIDE: única fuente de autorización
 * Cliente confía en esta verificación (no duplica queries)
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  // El matcher ya filtra las rutas, no necesitamos verificar publicPaths aquí
  
  let response = NextResponse.next({
    request: req,
  });

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

  // Verificar sesión
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Si no hay sesión, redirigir a login
  if (!session) {
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
    .eq('id', session.user.id)
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
