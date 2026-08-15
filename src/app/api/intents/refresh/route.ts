/**
 * API Route para invalidar las cacheas del motor de intenciones.
 * Solo accesible por admins autenticados.
 *
 * El dashboard escribe intenciones y respuestas directamente contra Supabase
 * desde el navegador, asi que el proceso servidor no se entera del cambio y
 * seguiria sirviendo su cache hasta que expire. La capa cliente invoca esta
 * ruta despues de cada escritura.
 *
 * Limitacion conocida: la cache vive en la memoria del proceso, y en un entorno
 * serverless cada instancia tiene la suya. Esta ruta solo invalida la instancia
 * que atiende la peticion, no la que recibe el webhook de WhatsApp, que puede
 * seguir sirviendo lo cacheado hasta que expire su TTL de cinco minutos.
 * Resuelve el caso de un solo proceso (desarrollo local y despliegues de una
 * sola instancia) y acota la ventana en el resto. Cerrarlo del todo exige un
 * marcador de version compartido, que costaria una consulta por mensaje: no
 * compensa para una edicion que ocurre pocas veces al dia.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { supabaseServer } from '@/services/supabase/server-client';
import { intentDetectionService } from '@/core/intent-engine/intent-detection.service';

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

  const { data: admin } = await supabaseServer
    .from('admin_users')
    .select('id')
    .eq('id', user.id)
    .eq('is_active', true)
    .single();

  if (!admin) return null;
  return user;
}

export async function POST(request: NextRequest) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    intentDetectionService.invalidateAll();
    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('Error invalidating intent caches:', error);
    return NextResponse.json(
      { error: 'No fue posible invalidar la cache de intenciones' },
      { status: 500 }
    );
  }
}
