import { randomUUID } from 'node:crypto';
import type { AiContextData } from '../../src/data/repositories/ai-context.repository';
import type { Scope } from '../../src/data/models/scope.model';
import type { CatalogValue } from '../../src/data/models/catalog-value.model';
import type { ContextResponseRow } from '../../src/data/repositories/conversation.repository';

interface FixtureWriter {
  scope(name: string, parentId: string, type: string, aliases: string[]): Promise<string>;
  catalog(scopeId: string, values: Record<string, string | number>): Promise<void>;
  content(scopeId: string, rows: Array<{ intentName: string; text: string }>): Promise<void>;
}

/** El simulador, la prueba con base y la vista previa comparten exactamente los datos. */
async function populateFymsaFixture(writer: FixtureWriter, rootScopeId: string) {
  const scope = writer.scope.bind(writer);
  const catalog = writer.catalog.bind(writer);
  const content = writer.content.bind(writer);
  const europa = await scope('Europa', rootScopeId, 'development', ['Europa']);
  const altabrisa = await scope('Altabrisa', rootScopeId, 'development', ['Altabrisa']);
  const aura = await scope('Modelo Aura', europa, 'model', ['Aura', 'Modelo Aura']);
  const vento = await scope('Modelo Vento', europa, 'model', ['Vento', 'Modelo Vento']);
  const solara = await scope('Modelo Solara', europa, 'model', ['Solara', 'Modelo Solara']);
  const terrenos = await scope('Terrenos', europa, 'model', ['Terrenos', 'lotes']);
  const cala = await scope('Modelo Cala', altabrisa, 'model', ['Cala', 'Modelo Cala']);
  const mare = await scope('Modelo Mare', altabrisa, 'model', ['Mare', 'Modelo Mare']);

  await catalog(europa, {
    precio_min_casas: '$1,850,000',
    precio_min_terrenos: '$780,000',
    direccion: 'Avenida Ruiz Cortines 1820, Colonia Tamulte',
  });
  await catalog(altabrisa, {
    precio_min_casas: '$1,420,000',
    direccion: 'Prolongacion Paseo Tabasco 1503',
  });
  await catalog(aura, { precio: '$1,850,000', recamaras: 3, banos: 2 });
  await catalog(vento, { precio: '$2,340,000', recamaras: 3, banos: 3 });
  await catalog(solara, { precio: '$2,980,000', recamaras: 4, banos: 4 });
  await catalog(terrenos, { precio: '$780,000', terreno: '160 m2' });
  await catalog(cala, { precio: '$1,420,000', recamaras: 2 });
  await catalog(mare, { precio: '$1,780,000', recamaras: 3 });

  await content(europa, [
    { intentName: 'precio', text: 'En Europa las casas van desde {precio_min_casas} y los terrenos desde {precio_min_terrenos}.' },
    { intentName: 'ubicacion', text: 'Europa esta en {direccion}.' },
    { intentName: 'seguridad', text: 'Europa tiene caseta 24/7, alberca semiolimpica y casa club.' },
  ]);
  await content(altabrisa, [
    { intentName: 'precio', text: 'En Altabrisa las casas van desde {precio_min_casas}.' },
    { intentName: 'ubicacion', text: 'Altabrisa esta en {direccion}.' },
  ]);
  await content(aura, [{ intentName: 'precio', text: 'Modelo Aura: desde {precio}, {recamaras} recamaras y {banos} banos.' }]);
  await content(vento, [{ intentName: 'precio', text: 'Modelo Vento: desde {precio}, {recamaras} recamaras y {banos} banos.' }]);
  await content(solara, [{ intentName: 'precio', text: 'Modelo Solara: desde {precio}, {recamaras} recamaras y {banos} banos.' }]);
  await content(terrenos, [{ intentName: 'precio', text: 'Terrenos desde {precio}, de {terreno}.' }]);
  await content(cala, [{ intentName: 'precio', text: 'Modelo Cala: desde {precio}, {recamaras} recamaras.' }]);
  await content(mare, [{ intentName: 'precio', text: 'Modelo Mare: desde {precio}, {recamaras} recamaras.' }]);
}

export function assertLocalSupabase() {
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '');
  if (!['http:', 'https:'].includes(url.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Solo contra Supabase local. Revisa .env.development.local.');
  }
}

/** El finally abarca también una siembra parcial, para restaurar tras cualquier fallo. */
export async function withFymsaFixture<T>(
  work: (repository: import('../../src/data/repositories/fymsa-fixture.repository').FymsaFixtureRepository) => Promise<T>,
  options: { suffix?: string; phone?: string } = {}
): Promise<T> {
  assertLocalSupabase();
  const { FymsaFixtureRepository } = await import('../../src/data/repositories/fymsa-fixture.repository');
  const { ROOT_SCOPE_ID } = await import('../../src/data/repositories/scope.repository');
  const repository = new FymsaFixtureRepository(options.suffix ?? randomUUID().slice(0, 6));
  try {
    await repository.prepare();
    await populateFymsaFixture(repository, ROOT_SCOPE_ID);
    return await work(repository);
  } finally {
    await repository.restore(options.phone);
    console.log('Base restaurada.');
  }
}

/** Vista previa con la misma siembra, sin conexiones ni contenido global de la base local. */
export async function buildFymsaContextData(): Promise<AiContextData> {
  const { ROOT_SCOPE_ID } = await import('../../src/data/repositories/scope.repository');
  const { formatCatalogValueForProse } = await import('../../src/data/repositories/catalog-value.repository');
  const scopes: Scope[] = [{
    id: ROOT_SCOPE_ID, parent_id: null, name: 'Inmobiliaria FYMSA', slug: 'fymsa',
    scope_type: 'root', is_active: true, metadata: {}, created_at: '', updated_at: '',
  }];
  const catalog: CatalogValue[] = [];
  const responses: ContextResponseRow[] = [];
  await populateFymsaFixture({
    async scope(name, parentId, type) {
      const id = 'fymsa-' + scopes.length;
      scopes.push({
        id, parent_id: parentId, name, slug: id, scope_type: type,
        is_active: true, metadata: {}, created_at: '', updated_at: '',
      });
      return id;
    },
    async catalog(scopeId, values) {
      for (const [key, value] of Object.entries(values)) {
        catalog.push({
          id: 'value-' + catalog.length, scope_id: scopeId, value_key: key, value,
          value_type: typeof value === 'number' ? 'number' : 'text', unit: null,
          edited_by_human: false, edited_by: null, edited_at: null, created_at: '', updated_at: '',
        });
      }
    },
    async content(scopeId, rows) {
      for (const row of rows) {
        const id = 'response-' + responses.length;
        responses.push({
          id, intent_id: id, intent_name: row.intentName, scope_id: scopeId,
          message_text: row.text, variables: {}, is_navigation: false, order_priority: 1,
        });
      }
    },
  }, ROOT_SCOPE_ID);
  const contents = scopes.map(scope => {
    const variables: Record<string, string> = {};
    const chain: Scope[] = [];
    let current: Scope | undefined = scope;
    while (current) {
      chain.unshift(current);
      current = scopes.find(candidate => candidate.id === current!.parent_id);
    }
    for (const ancestor of chain) {
      for (const value of catalog.filter(row => row.scope_id === ancestor.id)) {
        variables[value.value_key] = formatCatalogValueForProse(value);
      }
    }
    return { scope, variables, responses: responses.filter(row => row.scope_id === scope.id), resources: [] };
  });
  return {
    scopes, catalog, contents, qualifiedVariables: {}, persona: {}, appointmentScopeIds: [],
    brand: {
      root_scope_id: ROOT_SCOPE_ID, business_name: 'Inmobiliaria FYMSA',
      project_singular: 'desarrollo', project_plural: 'desarrollos', tone: 'friendly',
      is_configured: true, use_composed_greeting: true, created_at: '', updated_at: '',
    },
  };
}
