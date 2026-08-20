/**
 * Genera las opciones que el bot enumera cuando pregunta, y decide su
 * formato. Las opciones salen del catálogo y de nada más: no hay botones
 * redactados a mano en esta capacidad.
 */
import { scopeRepository } from '@/data/repositories/scope.repository';
import { conversationRepository } from '@/data/repositories/conversation.repository';
import { intentConfigRepository } from '@/data/repositories/intent-config.repository';
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
 * El rótulo es el nombre del alcance. Antes se le pegaba el precio del
 * catálogo --"Europa Resid · $700K"-- y eso hacía tres cosas mal a la vez: el
 * transporte corta el rótulo a veinte caracteres, así que recortaba el nombre,
 * que es la única parte que importa para elegir; salía el precio aunque la
 * pregunta fuera de créditos; y con los dos desarrollos al mismo precio no
 * distinguía nada. Un botón que ofrece elegir entre dos sitios dice cómo se
 * llaman los sitios.
 *
 * El nombre de la rama sí se añade, y solo cuando hace falta: con modelos que
 * se llaman igual en dos desarrollos, "Aura" a secas no se puede elegir.
 */
export async function buildScopeOptions(
  candidateIds: string[],
  _intentName: string
): Promise<ScopeOption[]> {
  if (candidateIds.length === 0) return [];

  const scopes = await scopeRepository.getScopes();
  const scopesById = new Map(scopes.map(scope => [scope.id, scope]));

  const branchIds = await Promise.all(candidateIds.map(scopeId => scopeRepository.getBranchId(scopeId)));
  const distinctBranches = new Set(branchIds.filter(Boolean));
  const branchByScope = new Map(candidateIds.map((scopeId, index) => [scopeId, branchIds[index]]));

  return candidateIds
    .map(scopeId => scopesById.get(scopeId))
    .filter((scope): scope is NonNullable<typeof scope> => Boolean(scope))
    .map(scope => {
      const branchId = branchByScope.get(scope.id);
      const branchName = distinctBranches.size > 1 && branchId && branchId !== scope.id
        ? scopesById.get(branchId)?.name
        : null;
      return {
        id: scope.id,
        scopeId: scope.id,
        label: [scope.name, branchName].filter(Boolean).join(' · '),
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

  const intents = (await intentConfigRepository.getAll())
    .filter(intent => intent.intent_name === intentName && intent.is_active);

  const idByScope = new Map<string | null, string>(
    intents.map(intent => [intent.scope_id, intent.id])
  );
  const orderedIds = order
    .map(scopeId => idByScope.get(scopeId))
    .filter((id): id is string => Boolean(id));
  if (orderedIds.length === 0) return null;

  const responses = await conversationRepository.getBotResponses(orderedIds, {}, level);
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
