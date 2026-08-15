import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.development.local') });
config({ path: resolve(process.cwd(), '.env.local') });

type TestRow = {
  id: string;
  scope_id: string | null;
  key: string;
  value: string;
};

const rootId = '00000000-0000-4000-8000-000000000001';
const childId = '00000000-0000-4000-8000-000000000002';
const inactiveBridgeId = '00000000-0000-4000-8000-000000000003';
const grandchildId = '00000000-0000-4000-8000-000000000004';

const scopes = [
  { id: rootId, parent_id: null, name: 'Root', slug: 'root', scope_type: 'root', is_active: true, metadata: {}, created_at: '', updated_at: '' },
  { id: childId, parent_id: rootId, name: 'Child', slug: 'child', scope_type: 'development', is_active: true, metadata: {}, created_at: '', updated_at: '' },
  { id: inactiveBridgeId, parent_id: rootId, name: 'Inactive bridge', slug: 'inactive', scope_type: 'development', is_active: false, metadata: {}, created_at: '', updated_at: '' },
  { id: grandchildId, parent_id: inactiveBridgeId, name: 'Grandchild', slug: 'grandchild', scope_type: 'variant', is_active: true, metadata: {}, created_at: '', updated_at: '' },
];

function createFakeClient(scopeRows: typeof scopes) {
  return {
    from() {
      return {
        select() {
          return Promise.resolve({ data: scopeRows, error: null });
        },
      };
    },
  };
}

const fakeClient = createFakeClient(scopes);

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const { scopeRepository } = await import('../src/data/repositories/scope.repository');
  scopeRepository.invalidateCache();

  const alternateRootId = '00000000-0000-4000-8000-000000000010';
  const alternateClient = createFakeClient([
    { ...scopes[0], id: alternateRootId, slug: 'alternate-root' },
  ]);
  const [alternateRoot] = await scopeRepository.getScopes(alternateClient);
  assert(alternateRoot.id === alternateRootId, 'El caché debe aislarse por instancia de cliente');

  const newlyCreatedScopeId = '00000000-0000-4000-8000-000000000011';
  const mutableScopes = [{ ...scopes[0] }];
  let mutableLoadCount = 0;
  const mutableClient = {
    from() {
      return {
        select() {
          mutableLoadCount += 1;
          return Promise.resolve({ data: [...mutableScopes], error: null });
        },
      };
    },
  };
  await scopeRepository.getScopes(mutableClient);
  mutableScopes.push({
    ...scopes[1],
    id: newlyCreatedScopeId,
    slug: 'newly-created',
  });
  const newScopeOrder = await scopeRepository.getResolutionOrder(newlyCreatedScopeId, mutableClient);
  assert(newScopeOrder.includes(newlyCreatedScopeId), 'Un alcance ausente debe forzar una recarga');
  assert(mutableLoadCount === 2, 'Un alcance ausente debe recargar el árbol exactamente una vez');

  const rows: TestRow[] = [
    { id: 'global', scope_id: null, key: 'global-only', value: 'global' },
    { id: 'root-shared', scope_id: rootId, key: 'shared', value: 'root' },
    { id: 'root-only', scope_id: rootId, key: 'root-only', value: 'root' },
    { id: 'child-shared', scope_id: childId, key: 'shared', value: 'child' },
    { id: 'inactive-shared', scope_id: inactiveBridgeId, key: 'shared', value: 'inactive' },
    { id: 'grandchild-own', scope_id: grandchildId, key: 'own', value: 'grandchild' },
    { id: 'unrelated', scope_id: '00000000-0000-4000-8000-000000000099', key: 'unrelated', value: 'unrelated' },
  ];

  const resolved = await scopeRepository.resolveRows(
    rows,
    grandchildId,
    row => row.key,
    fakeClient
  );
  const byKey = new Map(resolved.map(row => [row.key, row]));

  assert(byKey.get('own')?.value === 'grandchild', 'Debe resolver contenido propio');
  assert(byKey.get('root-only')?.value === 'root', 'Debe heredar del ancestro');
  assert(byKey.get('shared')?.value === 'root', 'Un nodo inactivo no debe aportar contenido');
  assert(byKey.get('root-only')?.value === 'root', 'Un nodo inactivo debe conservar el puente a la raíz');
  assert(byKey.get('global-only')?.value === 'global', 'Debe resolver contenido global al final');
  assert(!byKey.has('unrelated'), 'No debe incluir contenido de ramas no relacionadas');
  assert(!byKey.has('missing'), 'La ausencia en toda la cadena no debe producir contenido');

  const childResolved = await scopeRepository.resolveRows(
    rows,
    childId,
    row => row.key,
    fakeClient
  );
  const childByKey = new Map(childResolved.map(row => [row.key, row]));
  assert(childByKey.get('shared')?.value === 'child', 'El hijo activo debe sustituir al padre');

  const resourceRows: TestRow[] = [
    { id: 'root-1', scope_id: rootId, key: 'brochure', value: 'root-1' },
    { id: 'root-2', scope_id: rootId, key: 'brochure', value: 'root-2' },
    { id: 'root-3', scope_id: rootId, key: 'brochure', value: 'root-3' },
    { id: 'child-1', scope_id: childId, key: 'brochure', value: 'child-1' },
    { id: 'child-2', scope_id: childId, key: 'brochure', value: 'child-2' },
  ];
  const resourceSet = await scopeRepository.resolveRowSets(
    resourceRows,
    childId,
    row => row.key,
    fakeClient
  );
  assert(resourceSet.length === 2, 'Debe conservar el conjunto completo del alcance más profundo');
  assert(resourceSet.every(row => row.scope_id === childId), 'No debe mezclar el conjunto hijo con el padre');

  // Un alcance inexistente es un error de datos, no un resultado valido.
  // Devolver una lista vacia hacia que quien consulta siguiera adelante con
  // valores por defecto: los horarios de cita quedaban en blanco y la cita se
  // escribia con un horario codificado, sin que nada lo delatara.
  let lanzoPorAlcanceDesconocido = false;
  try {
    await scopeRepository.resolveRows(
      rows,
      '00000000-0000-4000-8000-000000000099',
      row => row.key,
      fakeClient
    );
  } catch {
    lanzoPorAlcanceDesconocido = true;
  }
  assert(lanzoPorAlcanceDesconocido, 'Un alcance inexistente debe lanzar error, no resolver vacio');

  scopeRepository.invalidateCache();
  console.log('Scope resolution verified');
}

main().catch(error => {
  console.error('Scope resolution verification failed:', error);
  process.exit(1);
});
