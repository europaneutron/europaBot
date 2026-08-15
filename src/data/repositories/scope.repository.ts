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
