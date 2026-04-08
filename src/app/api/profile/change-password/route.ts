/**
 * API Route para cambiar la contrasena del admin autenticado
 * Requiere contrasena actual para verificacion
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

export async function PUT(request: NextRequest) {
  try {
    // Verificar sesion con cookies del usuario
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
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const body = await request.json();
    const { current_password, new_password } = body;

    if (!current_password || !new_password) {
      return NextResponse.json(
        { error: 'Contrasena actual y nueva son requeridas' },
        { status: 400 }
      );
    }

    if (new_password.length < 12) {
      return NextResponse.json(
        { error: 'La nueva contrasena debe tener al menos 12 caracteres' },
        { status: 400 }
      );
    }

    // Verificar contrasena actual intentando login
    const verifyClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { error: signInError } = await verifyClient.auth.signInWithPassword({
      email: user.email!,
      password: current_password,
    });

    if (signInError) {
      return NextResponse.json(
        { error: 'La contrasena actual es incorrecta' },
        { status: 400 }
      );
    }

    // Cambiar contrasena usando service role (admin update)
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      user.id,
      { password: new_password }
    );

    if (updateError) {
      console.error('[Profile] Error updating password:', updateError);
      return NextResponse.json(
        { error: 'Error al actualizar contrasena' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Profile] Password change error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
