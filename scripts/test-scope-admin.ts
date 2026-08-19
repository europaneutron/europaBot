/**
 * Dar de alta un fraccionamiento a mano, renombrarlo, apagarlo y encenderlo.
 *
 * Es lo que hasta ahora solo sabia hacer el compilador. Se prueba contra los
 * repositorios, que es lo que la ruta usa, y se comprueba lo que de verdad
 * importa: que el alias quede --sin el, el lead que escribe "Europa" no llega
 * a "Europa Residencial"-- y que apagar retire el alcance de la conversacion
 * sin perder nada.
 *
 *   npx tsx scripts/test-scope-admin.ts
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
  const { scopeRoutingRepository } = await import('../src/data/repositories/scope-routing.repository');
  const { normalizeScopeAlias } = await import('../src/core/onboarding/client-vocabulary');

  const suffix = randomUUID().slice(0, 8);
  const name = `Europa Residencial ${suffix}`;
  let scopeId: string | null = null;

  try {
    console.log('\n1. Alta a mano: nace encendido y colgando del negocio');
    const scope = await scopeRepository.create({
      name,
      slug: `europa-${suffix}`,
      parent_id: ROOT_SCOPE_ID,
      is_active: true,
    });
    scopeId = scope.id;
    assert(scope.is_active, 'el alcance dado de alta a mano nace encendido');
    assert(scope.parent_id === ROOT_SCOPE_ID, 'cuelga del negocio');

    console.log('\n2. Los alias son parte del alta');
    await scopeRoutingRepository.createAliases(scope.id, [
      { alias: name, normalizedAlias: normalizeScopeAlias(name) },
      { alias: 'Europa', normalizedAlias: normalizeScopeAlias('Europa') },
    ]);
    const aliases = (await scopeRoutingRepository.getActiveAliases())
      .filter(item => item.scope_id === scope.id)
      .map(item => item.alias);
    assert(aliases.includes('Europa'), `el lead puede escribir "Europa": ${JSON.stringify(aliases)}`);

    console.log('\n3. Sustituir la lista de alias quita los que sobran');
    await scopeRoutingRepository.replaceAliases(scope.id, [
      { alias: 'Europa', normalizedAlias: normalizeScopeAlias('Europa') },
      { alias: 'el de Nacajuca', normalizedAlias: normalizeScopeAlias('el de Nacajuca') },
    ]);
    const afterReplace = (await scopeRoutingRepository.getAllAliases())
      .filter(item => item.scope_id === scope.id)
      .map(item => item.alias)
      .sort();
    assert(
      afterReplace.length === 2 && afterReplace.includes('el de Nacajuca') && !afterReplace.includes(name),
      `queda exactamente la lista nueva: ${JSON.stringify(afterReplace)}`
    );

    console.log('\n4. Renombrar no toca los alias');
    await scopeRepository.rename(scope.id, `Europa Premium ${suffix}`);
    const renamed = (await scopeRepository.getScopes()).find(item => item.id === scope.id);
    assert(renamed?.name === `Europa Premium ${suffix}`, 'el nombre cambia');
    const aliasesAfterRename = (await scopeRoutingRepository.getAllAliases())
      .filter(item => item.scope_id === scope.id);
    assert(aliasesAfterRename.length === 2, 'los alias siguen ahi tras renombrar');

    console.log('\n5. Apagar lo retira de la conversacion, sin borrar nada');
    await scopeRepository.setActive(scope.id, false);
    assert(
      !(await scopeRepository.isReachableScope(scope.id)),
      'apagado, el runtime deja de resolverlo'
    );
    const offAliases = (await scopeRoutingRepository.getActiveAliases())
      .filter(item => item.scope_id === scope.id);
    assert(offAliases.length === 0, 'sus alias dejan de rutear mientras esta apagado');
    const stillThere = (await scopeRoutingRepository.getAllAliases())
      .filter(item => item.scope_id === scope.id);
    assert(stillThere.length === 2, 'pero no se borraron: siguen guardados');

    console.log('\n6. Encenderlo lo devuelve tal cual');
    await scopeRepository.setActive(scope.id, true);
    assert(await scopeRepository.isReachableScope(scope.id), 'vuelve a responder');
    assert(
      (await scopeRoutingRepository.getActiveAliases()).filter(i => i.scope_id === scope.id).length === 2,
      'y sus alias vuelven a rutear'
    );
  } finally {
    if (scopeId) {
      await supabaseServer.from('scope_aliases').delete().eq('scope_id', scopeId);
      await supabaseServer.from('scopes').delete().eq('id', scopeId);
    }
    scopeRepository.invalidateCache();
  }
}

main()
  .then(() => console.log('\nAlta a mano verificada: nombre, alias, apagado y encendido'))
  .catch(error => { console.error(error); process.exit(1); });
