/**
 * API Route para gestionar la API key de OpenAI en Supabase Vault
 * Solo accesible por super_admin autenticados
 * 
 * GET  - Verifica si hay key configurada (nunca la expone)
 * PUT  - Guarda/actualiza la key en Vault
 * DELETE - Elimina la key del Vault
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { supabaseServer } from '@/services/supabase/server-client';

const VAULT_SECRET_NAME = 'openai_api_key';

async function getAuthenticatedAdmin(request: NextRequest) {
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

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  // Verificar que es super_admin
  const { data: admin } = await supabaseServer
    .from('admin_users')
    .select('role')
    .eq('auth_user_id', user.id)
    .single();

  if (!admin || admin.role !== 'super_admin') return null;

  return user;
}

export async function GET(request: NextRequest) {
  try {
    const admin = await getAuthenticatedAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const { data, error } = await supabaseServer.rpc('check_vault_secret', {
      secret_name: VAULT_SECRET_NAME
    });

    if (error) {
      console.error('[AI-Secret] Error checking vault:', error);
      return NextResponse.json({ exists: false });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[AI-Secret] GET error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const admin = await getAuthenticatedAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const body = await request.json();
    const { api_key } = body;

    if (!api_key || typeof api_key !== 'string' || api_key.trim().length < 10) {
      return NextResponse.json(
        { error: 'API key invalida' },
        { status: 400 }
      );
    }

    // Validar formato basico de OpenAI key
    const trimmed = api_key.trim();
    if (!trimmed.startsWith('sk-')) {
      return NextResponse.json(
        { error: 'La API key de OpenAI debe comenzar con sk-' },
        { status: 400 }
      );
    }

    const { error } = await supabaseServer.rpc('store_vault_secret', {
      secret_name: VAULT_SECRET_NAME,
      secret_value: trimmed,
      secret_description: 'OpenAI API Key para generacion de patrones'
    });

    if (error) {
      console.error('[AI-Secret] Error storing in vault:', error);
      return NextResponse.json(
        { error: 'Error al guardar en Vault' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[AI-Secret] PUT error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await getAuthenticatedAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const { error } = await supabaseServer.rpc('delete_vault_secret', {
      secret_name: VAULT_SECRET_NAME
    });

    if (error) {
      console.error('[AI-Secret] Error deleting from vault:', error);
      return NextResponse.json(
        { error: 'Error al eliminar de Vault' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[AI-Secret] DELETE error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
