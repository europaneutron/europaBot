/**
 * El árbol de alcances de una pregunta: quién tiene respuesta propia y quién
 * hereda. Funciones puras, compartidas entre la página del árbol
 * (`/intents/q/[intentName]`) y su script de verificación, para que la
 * prueba corra contra la misma lógica que ve el administrador.
 */

export interface TreeScope {
  id: string;
  parent_id: string | null;
  name: string;
  is_active: boolean;
}

export interface TreeRow {
  id: string;
  scope_id: string | null;
  is_active: boolean;
}

export interface TreeNode<TScope extends TreeScope, TRow extends TreeRow> {
  scope: TScope;
  depth: number;
  ownRow: TRow | null;
  /**
   * Fila propia archivada. Para el runtime no existe --`intent-detection`
   * solo carga las activas, asi que el alcance hereda-- pero la pantalla
   * tiene que enseñarla: sin esto, archivar era un camino de ida, porque la
   * fila desaparecia del arbol y no quedaba desde donde restaurarla.
   */
  archivedRow: TRow | null;
  inheritedFromName: string | null;
  /**
   * La fila que contesta de verdad en este alcance cuando no tiene propia.
   * El nombre del ancestro no basta para enseñar lo que el lead va a leer, y
   * eso es justo lo que no se veia: "Hereda de Inmobiliaria FYMSA" no dice si
   * el texto de arriba encaja en una conversacion que ya es de un
   * fraccionamiento.
   */
  inheritedRow: TRow | null;
}

/** Un alcance es alcanzable cuando él y todos sus ancestros están activos. */
export function reachableScopes<TScope extends TreeScope>(scopes: TScope[]): TScope[] {
  const byId = new Map(scopes.map(scope => [scope.id, scope]));
  return scopes.filter(scope => {
    let current: TScope | undefined = scope;
    while (current) {
      if (!current.is_active) return false;
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
    return true;
  });
}

export function buildQuestionTree<TScope extends TreeScope, TRow extends TreeRow>(
  scopes: TScope[],
  rows: TRow[],
  rootScopeId: string
): Array<TreeNode<TScope, TRow>> {
  const reachable = reachableScopes(scopes);
  const byId = new Map(reachable.map(scope => [scope.id, scope]));
  const ownRowByScope = new Map(
    rows.filter(row => row.is_active && row.scope_id).map(row => [row.scope_id as string, row])
  );
  // La archivada no participa en la herencia --el runtime no la ve-- pero se
  // conserva para poder enseñarla y restaurarla.
  const archivedRowByScope = new Map(
    rows.filter(row => !row.is_active && row.scope_id).map(row => [row.scope_id as string, row])
  );
  const childrenByParent = new Map<string, TScope[]>();
  for (const scope of reachable) {
    if (!scope.parent_id) continue;
    const children = childrenByParent.get(scope.parent_id) || [];
    children.push(scope);
    childrenByParent.set(scope.parent_id, children);
  }

  const nodes: Array<TreeNode<TScope, TRow>> = [];
  const visit = (scope: TScope, depth: number) => {
    const ownRow = ownRowByScope.get(scope.id) || null;
    let inheritedFromName: string | null = null;
    let inheritedRow: TRow | null = null;
    if (!ownRow) {
      let currentId = scope.parent_id;
      while (currentId) {
        const ancestorRow = ownRowByScope.get(currentId);
        if (ancestorRow) {
          inheritedFromName = byId.get(currentId)?.name || null;
          inheritedRow = ancestorRow;
          break;
        }
        currentId = byId.get(currentId)?.parent_id ?? null;
      }
    }
    nodes.push({
      scope,
      depth,
      ownRow,
      archivedRow: ownRow ? null : archivedRowByScope.get(scope.id) || null,
      inheritedFromName,
      inheritedRow,
    });
    for (const child of (childrenByParent.get(scope.id) || []).sort((a, b) => a.name.localeCompare(b.name))) {
      visit(child, depth + 1);
    }
  };

  const root = byId.get(rootScopeId);
  if (root) visit(root, 0);
  return nodes;
}

/**
 * Misma lógica que `resolveRows` del runtime: cuántos alcances se quedan sin
 * respuesta si se borra la fila propia de `scope`. Si algún ancestro por
 * encima todavía responde, nadie se queda mudo: solo heredan de más arriba.
 */
export function countOrphanedByDeleting<TScope extends TreeScope, TRow extends TreeRow>(
  scope: TScope,
  scopes: TScope[],
  rows: TRow[]
): number {
  const reachable = reachableScopes(scopes);
  const byId = new Map(reachable.map(s => [s.id, s]));
  const ownRowByScope = new Set(
    rows.filter(row => row.is_active && row.scope_id).map(row => row.scope_id as string)
  );

  let ancestorId = scope.parent_id;
  while (ancestorId) {
    if (ownRowByScope.has(ancestorId)) return 0;
    ancestorId = byId.get(ancestorId)?.parent_id ?? null;
  }

  const resolvesTo = (candidate: TScope): string | null => {
    let currentId: string | null = candidate.id;
    while (currentId) {
      if (ownRowByScope.has(currentId)) return currentId;
      currentId = byId.get(currentId)?.parent_id ?? null;
    }
    return null;
  };

  return reachable.filter(candidate => resolvesTo(candidate) === scope.id).length;
}
