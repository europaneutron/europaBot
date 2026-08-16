import { supabaseServer } from '@/services/supabase/server-client';
import type { Scope } from '@/data/models/scope.model';
import { ROOT_SCOPE_ID, scopeRepository } from './scope.repository';

export interface ScopeAlias {
  id: string;
  scope_id: string;
  alias: string;
}

export class ScopeRoutingRepository {
  async createAliases(
    scopeId: string,
    aliases: Array<{ alias: string; normalizedAlias: string }>
  ): Promise<ScopeAlias[]> {
    if (aliases.length === 0) return [];

    const { data, error } = await supabaseServer
      .from('scope_aliases')
      .upsert(
        aliases.map(item => ({
          scope_id: scopeId,
          alias: item.alias,
          normalized_alias: item.normalizedAlias,
        })),
        { onConflict: 'scope_id,normalized_alias' }
      )
      .select('id, scope_id, alias');
    if (error) throw error;
    return (data || []) as ScopeAlias[];
  }

  async findActiveScopeByAd(adId: string): Promise<string | null> {
    const { data, error } = await supabaseServer
      .from('scope_ads')
      .select('scope_id')
      .eq('ad_id', adId)
      .maybeSingle();

    if (error) throw error;
    if (!data?.scope_id) return null;

    return await scopeRepository.isReachableScope(data.scope_id) ? data.scope_id : null;
  }

  async getActiveAliases(): Promise<ScopeAlias[]> {
    const { data, error } = await supabaseServer
      .from('scope_aliases')
      .select('id, scope_id, alias');

    if (error) throw error;

    const reachable = await scopeRepository.getReachableScopeIds();
    return (data || [])
      .filter(row => reachable.has(row.scope_id))
      .map(({ id, scope_id, alias }) => ({ id, scope_id, alias }));
  }

  /**
   * Ramas de primer nivel disponibles: los hijos activos de la raíz.
   *
   * Es deliberado que no baje más: lo que cuelga de un desarrollo —modelos,
   * torres, etapas— es granularidad interna, no una alternativa entre las que
   * el lead deba elegir. Enumerarlo todo ponía a un desarrollo y a su propia
   * torre lado a lado en el saludo, y hacía que un cliente con un solo
   * desarrollo dejara de comportarse como tal en cuanto ese desarrollo ganaba
   * un submodelo.
   *
   * Cuando no hay ninguna rama, la raíz es la única opción y se devuelve sola,
   * que es el caso de una instalación de un solo propósito.
   */
  async getAvailableScopes(): Promise<Scope[]> {
    const scopes = await scopeRepository.getScopes();
    const branches = scopes
      .filter(scope => scope.parent_id === ROOT_SCOPE_ID && scope.is_active)
      .sort((left, right) => left.created_at.localeCompare(right.created_at));

    if (branches.length > 0) return branches;
    return scopes.filter(scope => scope.id === ROOT_SCOPE_ID);
  }

  /**
   * Una intención depende del alcance cuando dos ramas distintas definen
   * contenido propio para ella.
   *
   * Se cuenta por rama y no por alcance: un desarrollo que responde el precio
   * en su nivel y también en el de una de sus torres no plantea ninguna
   * ambigüedad al lead, porque ambas respuestas pertenecen al mismo desarrollo.
   */
  async isIntentScopeDependent(intentName: string): Promise<boolean> {
    const availableScopes = await this.getAvailableScopes();
    if (availableScopes.length <= 1) return false;

    const { data: intents, error: intentsError } = await supabaseServer
      .from('intent_configurations')
      .select('id, scope_id')
      .eq('intent_name', intentName)
      .eq('is_active', true);

    if (intentsError) throw intentsError;

    const reachable = await scopeRepository.getReachableScopeIds();
    const branchByIntentId = new Map<string, string>();
    for (const intent of intents || []) {
      if (!intent.scope_id || !reachable.has(intent.scope_id)) continue;

      const branchId = await scopeRepository.getBranchId(intent.scope_id);
      if (branchId) branchByIntentId.set(intent.id, branchId);
    }
    if (new Set(branchByIntentId.values()).size < 2) return false;

    const { data: responses, error: responsesError } = await supabaseServer
      .from('bot_responses')
      .select('intent_id')
      .in('intent_id', Array.from(branchByIntentId.keys()))
      .eq('is_active', true);

    if (responsesError) throw responsesError;

    const branchesWithContent = new Set(
      (responses || [])
        .map(response => branchByIntentId.get(response.intent_id))
        .filter((branchId): branchId is string => Boolean(branchId))
    );
    return branchesWithContent.size >= 2;
  }
}

export const scopeRoutingRepository = new ScopeRoutingRepository();
