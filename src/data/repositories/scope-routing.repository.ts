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

  /**
   * Deja el alcance exactamente con estos alias: los que sobran se borran.
   * Es lo que espera quien edita una lista en pantalla --quitar una linea la
   * quita-- a diferencia de `createAliases`, que solo agrega.
   */
  async replaceAliases(
    scopeId: string,
    aliases: Array<{ alias: string; normalizedAlias: string }>
  ): Promise<void> {
    const keep = aliases.map(item => item.normalizedAlias);
    await this.createAliases(scopeId, aliases);

    let query = supabaseServer.from('scope_aliases').delete().eq('scope_id', scopeId);
    if (keep.length > 0) query = query.not('normalized_alias', 'in', `(${keep.map(a => `"${a}"`).join(',')})`);

    const { error } = await query;
    if (error) throw error;
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

  /**
   * Todos los alias, tambien los de un alcance retirado. Es la vista de
   * administracion: quien configura tiene que ver lo que hay, no solo lo que
   * el runtime usa --para eso esta `getActiveAliases`--.
   */
  async getAllAliases(): Promise<ScopeAlias[]> {
    const { data, error } = await supabaseServer
      .from('scope_aliases')
      .select('id, scope_id, alias')
      .order('alias', { ascending: true });

    if (error) throw error;
    return (data || []) as ScopeAlias[];
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
   * Los hermanos vivos de un alcance: los demás hijos activos y alcanzables
   * de su mismo padre. Vacío para la raíz y para un hijo único.
   */
  async getSiblingScopes(scopeId: string): Promise<Scope[]> {
    const scopes = await scopeRepository.getScopes();
    const self = scopes.find(scope => scope.id === scopeId);
    if (!self?.parent_id) return [];

    const reachable = await scopeRepository.getReachableScopeIds();
    return scopes
      .filter(scope => (
        scope.parent_id === self.parent_id &&
        scope.id !== scopeId &&
        scope.is_active &&
        reachable.has(scope.id)
      ))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  /**
   * Dónde está la duda para una intención, partiendo del foco (o de la raíz
   * si no hay).
   *
   * El descenso baja mientras haya un solo camino: si en el nivel actual solo
   * un descendiente define contenido propio para la intención, ahí no hay
   * duda y se sigue bajando dentro de ese descendiente. Se detiene en el
   * primer nivel donde dos o más descendientes definen contenido distinto:
   * ese nivel es la pregunta, y esos descendientes son las opciones.
   *
   * Devuelve `null` cuando la respuesta no depende del alcance —ni en este
   * nivel ni en ninguno de los siguientes—, que es la señal de que hay que
   * responder directamente en vez de preguntar.
   */
  async findScopeDependency(
    intentName: string,
    fromScopeId: string | null
  ): Promise<{ level: string; candidateIds: string[] } | null> {
    const scopes = await scopeRepository.getScopes();
    const scopesByParent = new Map<string, Scope[]>();
    for (const scope of scopes) {
      if (!scope.parent_id) continue;
      const siblings = scopesByParent.get(scope.parent_id) || [];
      siblings.push(scope);
      scopesByParent.set(scope.parent_id, siblings);
    }

    const reachable = await scopeRepository.getReachableScopeIds();

    const { data: intents, error: intentsError } = await supabaseServer
      .from('intent_configurations')
      .select('id, scope_id')
      .eq('intent_name', intentName)
      .eq('is_active', true);
    if (intentsError) throw intentsError;

    const candidateIntents = (intents || []).filter(
      intent => intent.scope_id && reachable.has(intent.scope_id)
    );
    const { data: responses, error: responsesError } = await supabaseServer
      .from('bot_responses')
      .select('intent_id')
      .in('intent_id', candidateIntents.map(intent => intent.id))
      .eq('is_active', true);
    if (responsesError) throw responsesError;

    const intentIdsWithContent = new Set((responses || []).map(response => response.intent_id));
    const scopesWithOwnContent = new Set(
      candidateIntents
        .filter(intent => intentIdsWithContent.has(intent.id))
        .map(intent => intent.scope_id as string)
    );

    const subtreeAnswer = new Map<string, boolean>();
    const subtreeDefines = (scopeId: string): boolean => {
      const cached = subtreeAnswer.get(scopeId);
      if (cached !== undefined) return cached;
      // Marca antes de bajar: un arbol con ciclo se detiene aqui en vez de
      // desbordar la pila, y el `while` de abajo lo reporta como tal.
      subtreeAnswer.set(scopeId, false);
      const answer = scopesWithOwnContent.has(scopeId)
        || (scopesByParent.get(scopeId) || [])
          .filter(child => child.is_active && reachable.has(child.id))
          .some(child => subtreeDefines(child.id));
      subtreeAnswer.set(scopeId, answer);
      return answer;
    };

    // La regla: si el nivel donde esta la conversacion ya tiene respuesta
    // propia, no hay nada que preguntar. Se manda esa respuesta y son sus
    // botones los que deciden el paso siguiente.
    //
    // Antes esta funcion decidia mirando una sola cosa --si dos o mas
    // desarrollos pueden contestar-- y nunca miraba si el nivel de la
    // conversacion contestaba por si mismo. Con una respuesta escrita en la
    // raiz --"lotes desde $700 mil en los dos fraccionamientos"-- el lead
    // preguntaba el precio y recibia "¿de cual te platico?", ignorando lo que
    // el cliente habia escrito precisamente para ese momento.
    //
    // Se comprueba solo en el nivel de entrada porque es desde donde se
    // resuelve la respuesta despues (`handleIntent` usa el foco, no el nivel
    // al que baje este recorrido). Mas abajo, una respuesta propia no llega a
    // mandarse, asi que ahi la duda sigue siendo real.
    const startLevel = fromScopeId ?? ROOT_SCOPE_ID;
    if (scopesWithOwnContent.has(startLevel)) return null;

    let level = startLevel;
    const visited = new Set<string>();

    while (true) {
      if (visited.has(level)) throw new Error('Scope hierarchy contains a cycle');
      visited.add(level);

      const children = (scopesByParent.get(level) || [])
        .filter(child => child.is_active && reachable.has(child.id))
        .sort((a, b) => a.created_at.localeCompare(b.created_at));

      // Sin alternativa no hay nada que preguntar: con un único descendiente
      // se sigue bajando aunque ese descendiente no defina contenido propio,
      // porque no hay ningún otro camino entre el que elegir.
      if (children.length === 0) return null;
      if (children.length === 1) {
        level = children[0].id;
        continue;
      }

      // Un descendiente cuenta como camino cuando el contenido esta en el o en
      // cualquiera de los suyos. Mirar solo al hijo inmediato dejaba sin duda
      // la forma que el compilador produce de verdad: el precio vive en los
      // modelos, no en los desarrollos, asi que en la raiz ningun hijo definia
      // nada y el lead recibia los seis precios de los dos desarrollos
      // seguidos, sin decir cual era de cual y sin pregunta.
      const definingChildren = children.filter(child => subtreeDefines(child.id));

      if (definingChildren.length === 0) return null;
      if (definingChildren.length === 1) {
        level = definingChildren[0].id;
        continue;
      }
      return { level, candidateIds: definingChildren.map(child => child.id) };
    }
  }
}

export const scopeRoutingRepository = new ScopeRoutingRepository();
