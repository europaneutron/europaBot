/**
 * Con qué puede encadenar un botón escrito en este alcance.
 *
 * Un botón lleva dos cosas: a qué alcance mueve el foco y qué pregunta
 * contesta al llegar. Por eso no basta con una lista: hace falta saber, para
 * cada alcance al que se puede mover, qué preguntas alcanza ahí.
 *
 * La herencia va de hijo a padre, así que lo alcanzable se calcula desde el
 * alcance de destino, no desde el que escribe. Encadenar con algo que ese
 * destino no alcanza no da error: el runtime no encuentra la pregunta y se va
 * por otra rama --fija el foco y presenta el alcance-- así que el lead toca
 * una cosa y recibe otra. Por eso el filtro vive aquí y no en la pantalla.
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

    const { data: responses } = await supabaseServer
      .from('bot_responses')
      .select('intent_id')
      .in('intent_id', (intents || []).map(row => row.id))
      .eq('is_active', true);
    const answered = new Set((responses || []).map(row => row.intent_id));
    const scopeName = new Map(scopes.map(scope => [scope.id, scope.name]));

    // El alcance donde se escribe, y los desarrollos del negocio: son los
    // sitios a los que un boton puede mover el foco. No se baja mas porque lo
    // que cuelga de un desarrollo es granularidad interna, no una alternativa
    // que ofrecerle al lead --el mismo criterio que la enumeracion--.
    const reachableIds = await scopeRepository.getReachableScopeIds();
    const destinations = [
      scopeId,
      ROOT_SCOPE_ID,
      ...scopes
        .filter(scope => scope.parent_id === ROOT_SCOPE_ID && reachableIds.has(scope.id))
        .map(scope => scope.id),
    ].filter((id, index, all) => all.indexOf(id) === index && reachableIds.has(id));

    const targetsByScope: Record<string, unknown[]> = {};
    for (const destination of destinations) {
      const reachable = await scopeRepository.resolveRows(
        intents || [],
        destination,
        row => row.intent_name
      );
      targetsByScope[destination] = reachable
        // La propia pregunta solo se excluye cuando el boton no mueve el foco:
        // "el precio de Malasia" desde la respuesta de precio del negocio es
        // util, y no es repetirse.
        .filter(row => !(destination === scopeId && row.intent_name === exclude))
        .filter(row => !NOT_A_TARGET.has(row.intent_name))
        .map(row => ({
          intentName: row.intent_name,
          displayName: row.display_name,
          inheritedFrom: row.scope_id === destination ? null : (scopeName.get(row.scope_id!) || null),
          hasResponse: answered.has(row.id),
        }))
        .sort((left, right) => (
          Number(Boolean(left.inheritedFrom)) - Number(Boolean(right.inheritedFrom))
          || left.displayName.localeCompare(right.displayName)
        ));
    }

    return NextResponse.json({
      scopeId,
      destinations: destinations.map(id => ({
        id,
        name: scopeName.get(id) || 'Sin nombre',
        isCurrent: id === scopeId,
      })),
      targetsByScope,
    });
  } catch (loadError) {
    console.error('Error loading button targets:', loadError);
    return NextResponse.json({ error: 'No fue posible cargar los destinos' }, { status: 500 });
  }
}
