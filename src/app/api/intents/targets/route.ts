/**
 * Con qué puede encadenar un botón escrito en este alcance.
 *
 * La herencia va de hijo a padre: un alcance alcanza lo suyo y lo de sus
 * ancestros, nunca lo de un hermano. Encadenar con algo de un hermano no falla
 * con un error --el runtime no encuentra la pregunta y se va por otra rama, a
 * fijar el foco-- así que el lead toca "Compra mínima" y recibe otra cosa. Por
 * eso el filtro vive aquí y no en la pantalla.
 *
 * Se dice además de dónde sale cada una y si tiene con qué contestar: una
 * pregunta sin respuesta activa deja al lead sin nada cuando toca el botón.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/services/supabase/server-client';
import { ROOT_SCOPE_ID, scopeRepository } from '@/data/repositories/scope.repository';
import { getAuthenticatedAdmin } from '@/lib/server/authenticated-admin';

// Ni saludar ni despedirse son un paso siguiente que ofrecer.
const NOT_A_TARGET = new Set(['saludo', 'despedida']);

export async function GET(request: NextRequest) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const scopeId = request.nextUrl.searchParams.get('scopeId') || ROOT_SCOPE_ID;
    const exclude = request.nextUrl.searchParams.get('exclude') || '';

    const [{ data: intents, error }, scopes] = await Promise.all([
      supabaseServer
        .from('intent_configurations')
        .select('id, intent_name, display_name, scope_id, is_active')
        .eq('is_active', true),
      scopeRepository.getScopes(),
    ]);
    if (error) throw error;

    const reachable = await scopeRepository.resolveRows(
      intents || [],
      scopeId,
      row => row.intent_name
    );

    const { data: responses } = await supabaseServer
      .from('bot_responses')
      .select('intent_id')
      .in('intent_id', reachable.map(row => row.id))
      .eq('is_active', true);
    const answered = new Set((responses || []).map(row => row.intent_id));

    const scopeName = new Map(scopes.map(scope => [scope.id, scope.name]));

    const targets = reachable
      .filter(row => row.intent_name !== exclude && !NOT_A_TARGET.has(row.intent_name))
      .map(row => ({
        intentName: row.intent_name,
        displayName: row.display_name,
        // Propia cuando la fila vive en este alcance; heredada cuando viene de
        // un ancestro, y se dice de cuál.
        inheritedFrom: row.scope_id === scopeId ? null : (scopeName.get(row.scope_id!) || null),
        hasResponse: answered.has(row.id),
      }))
      // Primero lo propio, que es lo que quien escribe tiene en la cabeza;
      // despues lo heredado, y dentro de cada grupo por nombre.
      .sort((left, right) => (
        Number(Boolean(left.inheritedFrom)) - Number(Boolean(right.inheritedFrom))
        || left.displayName.localeCompare(right.displayName)
      ));

    return NextResponse.json({ scopeId, targets });
  } catch (loadError) {
    console.error('Error loading button targets:', loadError);
    return NextResponse.json({ error: 'No fue posible cargar los destinos' }, { status: 500 });
  }
}
