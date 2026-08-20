/**
 * Escribir la hoja de datos a mano: agregar un dato al catalogo y borrarlo.
 *
 * Hasta ahora el catalogo solo se llenaba desde una corrida del compilador
 * --la API tenia GET y PATCH, nada mas-- asi que un negocio de dos
 * desarrollos no podia teclear sus propios datos.
 *
 *   npx tsx scripts/test-catalog-manual-entry.ts
 */
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.development.local') });
config({ path: resolve(process.cwd(), '.env.local') });

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Fallo: ${message}`);
  console.log(`OK: ${message}`);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) {
    throw new Error('Este script solo puede escribir contra Supabase local');
  }

  const { supabaseServer } = await import('../src/services/supabase/server-client');
  const { ROOT_SCOPE_ID, scopeRepository } = await import('../src/data/repositories/scope.repository');
  const { catalogValueRepository } = await import('../src/data/repositories/catalog-value.repository');

  const suffix = randomUUID().slice(0, 8);
  const { data: admin } = await supabaseServer.from('admin_users').select('id').limit(1).maybeSingle();
  if (!admin) throw new Error('Se necesita un administrador local: corre scripts/seed-local-admin.ts');

  let scopeId: string | null = null;

  try {
    const scope = await scopeRepository.create({
      name: `Europa ${suffix}`,
      slug: `europa-cat-${suffix}`,
      parent_id: ROOT_SCOPE_ID,
      is_active: true,
    });
    scopeId = scope.id;

    console.log('\n1. Un dato escrito a mano queda como tal');
    const created = await catalogValueRepository.createValue(
      scope.id, 'precio', { value: '700000', valueType: 'money', unit: 'MXN' }, admin.id
    );
    assert(created.value_key === 'precio', 'la clave queda normalizada');
    assert(created.edited_by_human === true, 'nace marcado como escrito por una persona');

    console.log('\n2. El dato ya es usable por una respuesta del alcance');
    const variables = await catalogValueRepository.getResolvedVariables(scope.id);
    assert(variables.precio === '$700,000', `{precio} se rinde como importe: ${variables.precio}`);

    console.log('\n3. El mismo dato dos veces en el mismo alcance avisa, no revienta');
    let duplicateMessage = '';
    try {
      await catalogValueRepository.createValue(
        scope.id, 'precio', { value: '800000', valueType: 'money', unit: 'MXN' }, admin.id
      );
    } catch (error) {
      duplicateMessage = error instanceof Error ? error.message : '';
    }
    assert(
      duplicateMessage.includes('ya tiene un dato llamado'),
      `el aviso dice que ya existe: "${duplicateMessage}"`
    );

    console.log('\n4. Acentos y mayusculas no crean dos datos distintos');
    const accented = await catalogValueRepository.createValue(
      scope.id, 'Ubicación', { value: 'Carretera Villahermosa-Nacajuca Km 3.5', valueType: 'location' }, admin.id
    );
    assert(accented.value_key === 'ubicacion', `"Ubicación" se guarda como "${accented.value_key}"`);

    console.log('\n5. Borrar quita el dato y con el la variable');
    await catalogValueRepository.deleteValue(created.id);
    const afterDelete = await catalogValueRepository.getResolvedVariables(scope.id);
    assert(afterDelete.precio === undefined, 'tras borrar, {precio} ya no se resuelve en ese alcance');
    assert(afterDelete.ubicacion !== undefined, 'y el resto de datos del alcance sigue ahi');
  } finally {
    if (scopeId) {
      await supabaseServer.from('catalog_values').delete().eq('scope_id', scopeId);
      await supabaseServer.from('scopes').delete().eq('id', scopeId);
    }
    scopeRepository.invalidateCache();
  }
}

main()
  .then(() => console.log('\nHoja de datos a mano verificada: agregar, avisar del duplicado y borrar'))
  .catch(error => { console.error(error); process.exit(1); });
