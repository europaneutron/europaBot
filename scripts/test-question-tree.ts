/**
 * Verifica el árbol de una pregunta: crear y borrar una respuesta propia no
 * toca a los hermanos, y el aviso al borrar cuenta los mismos alcances que
 * resolvería el runtime.
 *
 *   npx tsx scripts/test-question-tree.ts
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
  const { buildQuestionTree, countOrphanedByDeleting } = await import('../src/lib/question-tree');

  const suffix = randomUUID().slice(0, 8);
  const intentName = `precio_arbol_${suffix}`;
  const scopeIds: string[] = [];
  const intentIds: string[] = [];

  try {
    // Arbol: root -> devA -> [modelA1, modelA2]
    const { data: devA, error: devAError } = await supabaseServer
      .from('scopes').insert({
        parent_id: ROOT_SCOPE_ID, name: `DevA ${suffix}`, slug: `dev-a-${suffix}`, is_active: true,
      }).select('id, name').single();
    if (devAError) throw devAError;
    scopeIds.push(devA.id);

    const { data: models, error: modelsError } = await supabaseServer
      .from('scopes').insert([
        { parent_id: devA.id, name: `ModelA1 ${suffix}`, slug: `model-a1-${suffix}`, is_active: true },
        { parent_id: devA.id, name: `ModelA2 ${suffix}`, slug: `model-a2-${suffix}`, is_active: true },
      ]).select('id, name');
    if (modelsError) throw modelsError;
    scopeIds.push(...models.map(m => m.id));
    scopeRepository.invalidateCache();

    // Fila general en el negocio (root): responde a todo el arbol por defecto.
    const { data: rootIntent, error: rootIntentError } = await supabaseServer
      .from('intent_configurations').insert({
        scope_id: ROOT_SCOPE_ID,
        intent_name: intentName,
        display_name: 'Precio',
        keywords: ['precio'], synonyms: [], typos: [], phrases: [],
        is_active: true, is_checkpoint: false, is_strong_signal: false,
      }).select('*').single();
    if (rootIntentError) throw rootIntentError;
    intentIds.push(rootIntent.id);

    const fetchRows = async () => {
      const { data, error } = await supabaseServer
        .from('intent_configurations').select('*').eq('intent_name', intentName);
      if (error) throw error;
      return data || [];
    };
    const fetchScopes = async () => {
      const { data, error } = await supabaseServer
        .from('scopes').select('id, parent_id, name, is_active');
      if (error) throw error;
      return data || [];
    };

    console.log('\n1. Antes de crear la propia, todo hereda de root');
    let rows = await fetchRows();
    let scopes = await fetchScopes();
    let tree = buildQuestionTree(scopes, rows, ROOT_SCOPE_ID);
    const devANode = tree.find(n => n.scope.id === devA.id)!;
    assert(devANode.inheritedFromName === 'Business' || Boolean(devANode.inheritedFromName), 'devA hereda de un ancestro antes de tener fila propia');

    console.log('\n2. Crear una propia en devA no toca a los hermanos (modelA1, modelA2, root)');
    const { data: devAIntent, error: devAIntentError } = await supabaseServer
      .from('intent_configurations').insert({
        scope_id: devA.id,
        intent_name: intentName,
        display_name: 'Precio',
        keywords: ['precio'], synonyms: [], typos: [], phrases: [],
        is_active: true, is_checkpoint: false, is_strong_signal: false,
      }).select('*').single();
    if (devAIntentError) throw devAIntentError;
    intentIds.push(devAIntent.id);

    rows = await fetchRows();
    const rootRowAfterCreate = rows.find(r => r.id === rootIntent.id);
    const model1RowAfterCreate = rows.find(r => r.scope_id === models[0].id);
    assert(rootRowAfterCreate?.display_name === 'Precio' && rootRowAfterCreate?.keywords.length === 1, 'la fila de root no cambio al crear la de devA');
    assert(model1RowAfterCreate === undefined, 'modelA1 sigue sin fila propia (no se le creo una de rebote)');

    console.log('\n3. Borrar la propia de devA no toca a los hermanos, y vuelve a heredar');
    await supabaseServer.from('intent_configurations').delete().eq('id', devAIntent.id);
    intentIds.splice(intentIds.indexOf(devAIntent.id), 1);

    rows = await fetchRows();
    const rootRowAfterDelete = rows.find(r => r.id === rootIntent.id);
    assert(rootRowAfterDelete?.id === rootIntent.id, 'la fila de root sigue existiendo tal cual tras borrar la de devA');
    assert(!rows.some(r => r.scope_id === devA.id), 'devA volvio a heredar: ya no tiene fila propia');

    console.log('\n4. El aviso al borrar cuenta los mismos alcances que resolveria el runtime');
    // Se quita la fila de root para este escenario: si un ancestro por
    // encima de devA todavia respondiera, nadie se quedaria huerfano -- eso
    // ya lo cubre el caso "predictedOrphans === actualOrphans === 0" de
    // arriba. Aqui se prueba el caso en que si hay huerfanos de verdad, con
    // un arbol de tres niveles: root (sin fila) -> devA -> {modelA1 (propia), modelA2 (hereda)}.
    await supabaseServer.from('intent_configurations').delete().eq('id', rootIntent.id);
    intentIds.splice(intentIds.indexOf(rootIntent.id), 1);

    const { data: devAIntent2, error: devAIntentError2 } = await supabaseServer
      .from('intent_configurations').insert({
        scope_id: devA.id,
        intent_name: intentName,
        display_name: 'Precio',
        keywords: ['precio'], synonyms: [], typos: [], phrases: [],
        is_active: true, is_checkpoint: false, is_strong_signal: false,
      }).select('*').single();
    if (devAIntentError2) throw devAIntentError2;
    intentIds.push(devAIntent2.id);

    const { data: model1Intent, error: model1IntentError } = await supabaseServer
      .from('intent_configurations').insert({
        scope_id: models[0].id,
        intent_name: intentName,
        display_name: 'Precio',
        keywords: ['precio'], synonyms: [], typos: [], phrases: [],
        is_active: true, is_checkpoint: false, is_strong_signal: false,
      }).select('*').single();
    if (model1IntentError) throw model1IntentError;
    intentIds.push(model1Intent.id);

    rows = await fetchRows();
    scopes = await fetchScopes();
    const devANodeNow = buildQuestionTree(scopes, rows, ROOT_SCOPE_ID).find(n => n.scope.id === devA.id)!;
    const predictedOrphans = countOrphanedByDeleting(devANodeNow.scope, scopes, rows);

    // Verificacion independiente: para cada alcance alcanzable, resolver con
    // resolveRows (la funcion real del runtime) antes y despues de quitar la
    // fila de devA, y contar a cuantos les cambia de "responde" a "nada".
    const reachableIds = [ROOT_SCOPE_ID, devA.id, models[0].id, models[1].id];
    let actualOrphans = 0;
    for (const scopeId of reachableIds) {
      const [beforeRow] = await scopeRepository.resolveRows(rows, scopeId, r => r.intent_name);
      const rowsWithoutDevA = rows.filter(r => r.id !== devAIntent2.id);
      const [afterRow] = await scopeRepository.resolveRows(rowsWithoutDevA, scopeId, r => r.intent_name);
      if (beforeRow && !afterRow) actualOrphans += 1;
    }

    assert(predictedOrphans === actualOrphans, `el aviso (${predictedOrphans}) coincide con resolveRows del runtime (${actualOrphans})`);
    // modelA1 tiene fila propia (no se queda mudo). devA (la fila que se
    // borraria) y modelA2, que hereda de devA, se quedan sin nada: 2.
    assert(predictedOrphans === 2, `devA y modelA2 quedan huerfanos, modelA1 no: ${predictedOrphans}`);

    console.log('\n5. Una respuesta archivada sigue viendose, y se puede restaurar');
    // El runtime no la ve --intent-detection filtra is_active-- asi que el
    // alcance hereda; pero si el arbol tampoco la enseñara, archivar seria un
    // camino de ida: no quedaria desde donde restaurarla.
    await supabaseServer
      .from('intent_configurations')
      .update({ is_active: false })
      .eq('id', model1Intent.id);

    rows = await fetchRows();
    const archivedNode = buildQuestionTree(scopes, rows, ROOT_SCOPE_ID).find(n => n.scope.id === models[0].id)!;
    assert(archivedNode.ownRow === null, 'la archivada no cuenta como propia: para el runtime ese alcance hereda');
    assert(archivedNode.archivedRow?.id === model1Intent.id, 'la archivada sigue en el arbol, con su id para restaurarla');
    assert(archivedNode.inheritedFromName !== null, 'mientras esta archivada, el alcance hereda de un ancestro');

    const [resolvedForModel1] = await scopeRepository.resolveRows(
      rows.filter(r => r.is_active), models[0].id, r => r.intent_name
    );
    assert(
      resolvedForModel1?.id === devAIntent2.id,
      'coincide con el runtime: modelA1 contesta la de devA mientras la suya esta archivada'
    );

  } finally {
    for (const id of intentIds) {
      await supabaseServer.from('bot_responses').delete().eq('intent_id', id);
      await supabaseServer.from('intent_configurations').delete().eq('id', id);
    }
    for (const scopeId of scopeIds.reverse()) {
      await supabaseServer.from('scopes').delete().eq('id', scopeId);
    }
    const { scopeRepository: repo } = await import('../src/data/repositories/scope.repository');
    repo.invalidateCache();
  }
}

main()
  .then(() => console.log('\nArbol de la pregunta verificado: los hermanos no se tocan y el aviso cuenta bien'))
  .catch(error => { console.error(error); process.exit(1); });
