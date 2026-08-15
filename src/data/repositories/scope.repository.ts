import { supabaseServer } from '@/services/supabase/server-client';
import type { Scope, ScopedRow } from '@/data/models/scope.model';

const ROOT_SCOPE_ID = '00000000-0000-4000-8000-000000000001';
const CACHE_TTL_MS = 5 * 60 * 1000;

type ScopeCache = {
  scopes: Scope[];
  loadedAt: number;
};

let scopeCaches = new WeakMap<object, ScopeCache>();

export class ScopeRepository {
  async getScopes(client: any = supabaseServer): Promise<Scope[]> {
    const cache = scopeCaches.get(client);
    if (cache && Date.now() - cache.loadedAt <= CACHE_TTL_MS) {
      return cache.scopes;
    }

    const { data, error } = await client
      .from('scopes')
      .select('*');

    if (error) {
      console.error('Error loading scopes:', error);
      throw new Error('Failed to load scopes');
    }

    const scopes = (data || []) as Scope[];
    scopeCaches.set(client, { scopes, loadedAt: Date.now() });
    return scopes;
  }

  async isActiveScope(scopeId: string, client: any = supabaseServer): Promise<boolean> {
    const scopes = await this.getScopesContaining(scopeId, client);
    return scopes.some(scope => scope.id === scopeId && scope.is_active);
  }

  private async getScopesContaining(scopeId: string, client: any): Promise<Scope[]> {
    let scopes = await this.getScopes(client);
    if (scopes.some(scope => scope.id === scopeId)) return scopes;

    this.invalidateCache(client);
    scopes = await this.getScopes(client);
    return scopes;
  }

  async create(
    values: Pick<Scope, 'name' | 'slug'> & Partial<Pick<Scope, 'parent_id' | 'scope_type' | 'is_active' | 'metadata'>>,
    client: any = supabaseServer
  ): Promise<Scope> {
    const { data, error } = await client
      .from('scopes')
      .insert(values)
      .select('*')
      .single();

    if (error) throw error;
    this.invalidateCache(client);
    return data as Scope;
  }

  async reparent(
    scopeId: string,
    parentId: string | null,
    client: any = supabaseServer
  ): Promise<Scope> {
    const { data, error } = await client
      .from('scopes')
      .update({ parent_id: parentId })
      .eq('id', scopeId)
      .select('*')
      .single();

    if (error) throw error;
    this.invalidateCache(client);
    return data as Scope;
  }

  /**
   * Un alcance es alcanzable cuando su propia fila está activa y todos sus
   * ancestros también lo están.
   *
   * `isActiveScope` mira solo la fila, que basta para validar una petición
   * puntual. Para decidir de qué se conversa no basta: desactivar un desarrollo
   * tiene que retirar con él todo lo que cuelga de sus ramas. Si solo se mirara
   * la fila propia, los submodelos de un desarrollo agotado seguirían
   * cambiando el foco y ofreciéndose en el saludo.
   */
  async isReachableScope(scopeId: string, client: any = supabaseServer): Promise<boolean> {
    const scopes = await this.getScopesContaining(scopeId, client);
    return this.reachableIdsFrom(scopes).has(scopeId);
  }

  /**
   * Identificadores de todos los alcances alcanzables, en una sola pasada.
   */
  async getReachableScopeIds(client: any = supabaseServer): Promise<Set<string>> {
    return this.reachableIdsFrom(await this.getScopes(client));
  }

  private reachableIdsFrom(scopes: Scope[]): Set<string> {
    const scopesById = new Map(scopes.map(scope => [scope.id, scope]));
    const reachable = new Set<string>();
    const unreachable = new Set<string>();

    for (const scope of scopes) {
      const chain: string[] = [];
      const visited = new Set<string>();
      let currentId: string | null = scope.id;
      let result: boolean | null = null;

      while (currentId) {
        if (reachable.has(currentId)) { result = true; break; }
        if (unreachable.has(currentId)) { result = false; break; }
        if (visited.has(currentId)) throw new Error('Scope hierarchy contains a cycle');
        visited.add(currentId);

        const current: Scope | undefined = scopesById.get(currentId);
        if (!current || !current.is_active) { result = false; break; }

        chain.push(currentId);
        currentId = current.parent_id;
      }

      const isReachable = result ?? true;
      for (const id of chain) (isReachable ? reachable : unreachable).add(id);
    }

    return reachable;
  }

  /**
   * Rama de primer nivel de la que desciende un alcance: el hijo de la raíz que
   * lo contiene, o él mismo si ya lo es.
   *
   * Es la unidad que el lead reconoce como "un desarrollo". Todo lo que cuelga
   * más abajo —modelos, torres, etapas— es granularidad interna de esa misma
   * rama y no una alternativa entre la que haya que elegir.
   *
   * Devuelve null para la raíz y para un alcance que no exista.
   */
  async getBranchId(scopeId: string, client: any = supabaseServer): Promise<string | null> {
    if (scopeId === ROOT_SCOPE_ID) return null;

    const scopes = await this.getScopesContaining(scopeId, client);
    const scopesById = new Map(scopes.map(scope => [scope.id, scope]));
    const visited = new Set<string>();
    let currentId: string | null = scopeId;

    while (currentId) {
      if (visited.has(currentId)) throw new Error('Scope hierarchy contains a cycle');
      visited.add(currentId);

      const scope: Scope | undefined = scopesById.get(currentId);
      if (!scope) return null;
      if (scope.parent_id === ROOT_SCOPE_ID || scope.parent_id === null) return scope.id;
      currentId = scope.parent_id;
    }

    return null;
  }

  async getResolutionOrder(
    scopeId?: string | null,
    client: any = supabaseServer
  ): Promise<Array<string | null>> {
    const requestedId = scopeId === undefined ? ROOT_SCOPE_ID : scopeId;

    if (requestedId === null) return [null];
    const scopes = await this.getScopesContaining(requestedId, client);
    const scopesById = new Map(scopes.map(scope => [scope.id, scope]));

    // Un alcance inexistente es un error de programación o de datos, no un
    // resultado válido. Devolver una lista vacía hacía que quien consulta
    // recibiera cero filas y siguiera adelante con valores por defecto: los
    // horarios de cita quedaban en blanco y la cita se escribía con un horario
    // codificado, sin que nada lo delatara.
    if (!scopesById.has(requestedId)) {
      throw new Error(`El alcance ${requestedId} no existe o está inactivo`);
    }

    const order: Array<string | null> = [];
    const visited = new Set<string>();
    let currentId: string | null = requestedId;

    while (currentId) {
      if (visited.has(currentId)) {
        throw new Error('Scope hierarchy contains a cycle');
      }

      const scope = scopesById.get(currentId);
      if (!scope) {
        throw new Error(`Scope hierarchy references missing scope "${currentId}"`);
      }

      visited.add(currentId);
      if (scope.is_active) order.push(currentId);
      currentId = scope.parent_id;
    }

    order.push(null);
    return order;
  }

  async resolveRows<T extends ScopedRow>(
    rows: T[],
    scopeId: string | null | undefined,
    keyOf: (row: T) => string,
    client: any = supabaseServer
  ): Promise<T[]> {
    const order = await this.getResolutionOrder(scopeId, client);
    const rowsByScope = new Map<string | null, T[]>();

    for (const row of rows) {
      const scopedRows = rowsByScope.get(row.scope_id) || [];
      scopedRows.push(row);
      rowsByScope.set(row.scope_id, scopedRows);
    }

    const resolved = new Map<string, T>();
    for (const resolvedScopeId of order) {
      for (const row of rowsByScope.get(resolvedScopeId) || []) {
        const key = keyOf(row);
        if (!resolved.has(key)) resolved.set(key, row);
      }
    }

    return Array.from(resolved.values());
  }

  async resolveRowSets<T extends ScopedRow>(
    rows: T[],
    scopeId: string | null | undefined,
    groupKeyOf: (row: T) => string,
    client: any = supabaseServer
  ): Promise<T[]> {
    const order = await this.getResolutionOrder(scopeId, client);
    const resolvedGroups = new Set<string>();
    const resolvedRows: T[] = [];

    for (const resolvedScopeId of order) {
      const rowsAtScope = rows.filter(row => row.scope_id === resolvedScopeId);
      const groupsAtScope = new Map<string, T[]>();

      for (const row of rowsAtScope) {
        const groupKey = groupKeyOf(row);
        const group = groupsAtScope.get(groupKey) || [];
        group.push(row);
        groupsAtScope.set(groupKey, group);
      }

      groupsAtScope.forEach((group, groupKey) => {
        if (resolvedGroups.has(groupKey)) return;
        resolvedGroups.add(groupKey);
        resolvedRows.push(...group);
      });
    }

    return resolvedRows;
  }

  invalidateCache(client?: object): void {
    if (client) {
      scopeCaches.delete(client);
      return;
    }
    scopeCaches = new WeakMap<object, ScopeCache>();
  }
}

export const scopeRepository = new ScopeRepository();
export { ROOT_SCOPE_ID };
