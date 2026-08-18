/**
 * Genera las opciones que el bot enumera cuando pregunta, y decide su
 * formato. Las opciones salen del catálogo y de nada más: no hay botones
 * redactados a mano en esta capacidad.
 */
import { supabaseServer } from '@/services/supabase/server-client';
import { scopeRepository } from '@/data/repositories/scope.repository';
import { conversationRepository } from '@/data/repositories/conversation.repository';
import { isSimpleResponseWithMedia, isFragmentedResponse } from '@/types/message-fragments.types';
import type { TextFragment } from '@/types/message-fragments.types';
import type { PendingOfferOption } from '@/data/models/user.model';

export type ScopeOption = PendingOfferOption;

export const MAX_BUTTON_OPTIONS = 3;
export const MAX_LIST_OPTIONS = 10;

export type EnumerationFormat = 'buttons' | 'list' | 'narrow';

/**
 * El formato lo impone el transporte, no una preferencia de redacción: hasta
 * 3, botones; de 4 a 10, lista; más de 10 no se puede enumerar directo.
 */
export function chooseEnumerationFormat(optionCount: number): EnumerationFormat {
  if (optionCount <= MAX_BUTTON_OPTIONS) return 'buttons';
  if (optionCount <= MAX_LIST_OPTIONS) return 'list';
  return 'narrow';
}

/**
 * Una opción por cada alcance vivo en `candidateIds`. `candidateIds` ya viene
 * filtrado a alcances alcanzables (activos, con ancestros activos) desde
 * `findScopeDependency`, así que un alcance retirado nunca llega aquí.
 *
 * Cuando el catálogo tiene un dato que distingue la opción —hoy, las
 * variables con las que se interpola su propia respuesta, típicamente el
 * precio— se antepone al nombre. Sin esa variable, la opción es solo el
 * nombre del alcance.
 */
export async function buildScopeOptions(
  candidateIds: string[],
  intentName: string
): Promise<ScopeOption[]> {
  if (candidateIds.length === 0) return [];

  const scopes = await scopeRepository.getScopes();
  const scopesById = new Map(scopes.map(scope => [scope.id, scope]));

  const { data: intents, error: intentsError } = await supabaseServer
    .from('intent_configurations')
    .select('id, scope_id')
    .eq('intent_name', intentName)
    .eq('is_active', true)
    .in('scope_id', candidateIds);
  if (intentsError) throw intentsError;

  const intentIdByScope = new Map<string, string>(
    (intents || []).map(intent => [intent.scope_id as string, intent.id as string])
  );
  const { data: responses, error: responsesError } = await supabaseServer
    .from('bot_responses')
    .select('intent_id, variables')
    .in('intent_id', Array.from(intentIdByScope.values()))
    .eq('is_active', true);
  if (responsesError) throw responsesError;

  const variablesByIntentId = new Map<string, Record<string, unknown>>();
  for (const response of responses || []) {
    if (response.variables && !variablesByIntentId.has(response.intent_id)) {
      variablesByIntentId.set(response.intent_id, response.variables as Record<string, unknown>);
    }
  }

  return candidateIds
    .map(scopeId => scopesById.get(scopeId))
    .filter((scope): scope is NonNullable<typeof scope> => Boolean(scope))
    .map(scope => {
      const intentId = intentIdByScope.get(scope.id);
      const variables = intentId ? variablesByIntentId.get(intentId) : undefined;
      const detail = variables
        ? Object.values(variables).slice(0, 2).map(String).filter(Boolean).join(' · ')
        : '';
      return {
        id: scope.id,
        scopeId: scope.id,
        label: detail ? `${scope.name} · ${detail}` : scope.name,
      };
    });
}

/**
 * Lo que ya es cierto en el nivel de la duda, resuelto exactamente como si el
 * foco estuviera puesto ahí. Puede no haber nada que afirmar —dos desarrollos
 * sin precio compartido, por ejemplo— y entonces se pregunta sin inventar un
 * dato que cruce las ramas.
 */
export async function resolveLevelAnswer(
  intentName: string,
  level: string
): Promise<string | null> {
  const order = await scopeRepository.getResolutionOrder(level);

  const { data: intents, error } = await supabaseServer
    .from('intent_configurations')
    .select('id, scope_id')
    .eq('intent_name', intentName)
    .eq('is_active', true);
  if (error) throw error;

  const idByScope = new Map<string | null, string>(
    (intents || []).map(intent => [intent.scope_id, intent.id])
  );
  const orderedIds = order
    .map(scopeId => idByScope.get(scopeId))
    .filter((id): id is string => Boolean(id));
  if (orderedIds.length === 0) return null;

  const responses = await conversationRepository.getBotResponses(orderedIds);
  const first = responses[0];
  if (!first) return null;
  if (typeof first === 'string') return first;
  if (isSimpleResponseWithMedia(first)) return first.text ?? null;
  if (isFragmentedResponse(first)) {
    return first.fragments
      .filter((fragment): fragment is TextFragment => fragment.type === 'text')
      .map(fragment => fragment.content)
      .join('\n') || null;
  }
  return null;
}
