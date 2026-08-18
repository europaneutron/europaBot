/**
 * Prueba dedicada de `scopeRoutingRepository.findScopeDependency`: los tres
 * escenarios de la spec `enumerated-disambiguation` que `test-scope-routing.ts`
 * no cubre.
 *
 *   npx tsx scripts/test-scope-dependency.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.development.local') });
config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!supabaseUrl || (!supabaseUrl.includes('127.0.0.1') && !supabaseUrl.includes('localhost'))) {
  console.error('NEXT_PUBLIC_SUPABASE_URL must point to the local stack');
  process.exit(1);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const { supabaseServer } = await import('../src/services/supabase/server-client');
  const { scopeRoutingRepository } = await import('../src/data/repositories/scope-routing.repository');
  const { scopeRepository, ROOT_SCOPE_ID } = await import('../src/data/repositories/scope.repository');

  const suffix = Date.now().toString(36);
  const createdScopeIds: string[] = [];
  const createdIntentIds: string[] = [];
  const existingScopeStates: Array<{ id: string; is_active: boolean }> = [];

  try {
    // Un solo desarrollo activo mientras corre la prueba, para que la duda de
    // primer nivel no aparezca por sí sola.
    const { data: existingScopes, error: existingScopesError } = await supabaseServer
      .from('scopes')
      .select('id, is_active')
      .neq('id', ROOT_SCOPE_ID);
    if (existingScopesError) throw existingScopesError;
    existingScopeStates.push(...(existingScopes || []));
    if (existingScopeStates.length > 0) {
      const { error } = await supabaseServer
        .from('scopes')
        .update({ is_active: false })
        .in('id', existingScopeStates.map(scope => scope.id));
      if (error) throw error;
    }
    scopeRepository.invalidateCache();

    // --- 1.3: un solo desarrollo, modelos con precios distintos: la duda
    // queda en los modelos, no en el desarrollo.
    const { data: singleDev, error: singleDevError } = await supabaseServer
      .from('scopes')
      .insert({ parent_id: ROOT_SCOPE_ID, name: `Solo ${suffix}`, slug: `solo-${suffix}`, is_active: true })
      .select('id')
      .single();
    if (singleDevError) throw singleDevError;
    createdScopeIds.push(singleDev.id);

    const { data: models, error: modelsError } = await supabaseServer
      .from('scopes')
      .insert([
        { parent_id: singleDev.id, name: `ModeloA ${suffix}`, slug: `modelo-a-${suffix}`, is_active: true },
        { parent_id: singleDev.id, name: `ModeloB ${suffix}`, slug: `modelo-b-${suffix}`, is_active: true },
      ])
      .select('id');
    if (modelsError) throw modelsError;
    createdScopeIds.push(...models.map(m => m.id));
    scopeRepository.invalidateCache();

    const priceIntentName = `dep_price_${suffix}`;
    const { data: priceIntents, error: priceIntentsError } = await supabaseServer
      .from('intent_configurations')
      .insert([
        { scope_id: models[0].id, intent_name: priceIntentName, display_name: 'A', keywords: ['x'], is_active: true, is_checkpoint: false },
        { scope_id: models[1].id, intent_name: priceIntentName, display_name: 'B', keywords: ['x'], is_active: true, is_checkpoint: false },
      ])
      .select('id, scope_id');
    if (priceIntentsError) throw priceIntentsError;
    createdIntentIds.push(...priceIntents.map(i => i.id));
    const { error: priceResponsesError } = await supabaseServer.from('bot_responses').insert(
      priceIntents.map(intent => ({
        intent_id: intent.id,
        response_key: 'main',
        message_text: `precio-${intent.scope_id}`,
        response_type: 'simple',
        is_active: true,
      }))
    );
    if (priceResponsesError) throw priceResponsesError;

    const singleDevDependency = await scopeRoutingRepository.findScopeDependency(priceIntentName, null);
    assert(
      singleDevDependency !== null && singleDevDependency.level === singleDev.id,
      `With a single development the doubt must sit at the models level: ${JSON.stringify(singleDevDependency)}`
    );
    assert(
      new Set(singleDevDependency!.candidateIds).size === 2 &&
      models.every(m => singleDevDependency!.candidateIds.includes(m.id)),
      'The candidates must be the two models, not the development'
    );

    // --- 1.5: la duda se calcula desde el foco, no siempre desde la raíz.
    // Con "Solo" como único desarrollo, desde la raíz la duda desciende hasta
    // sus modelos igual que si el foco ya estuviera puesto ahí; con el foco
    // puesto en uno de los modelos, ese modelo ya responde por sí solo.
    const fromRoot = await scopeRoutingRepository.findScopeDependency(priceIntentName, null);
    assert(
      fromRoot !== null && fromRoot.level === singleDev.id,
      `From root, with only one branch in play, doubt must descend into it: ${JSON.stringify(fromRoot)}`
    );
    const fromFocus = await scopeRoutingRepository.findScopeDependency(priceIntentName, singleDev.id);
    assert(
      fromFocus !== null && fromFocus.level === singleDev.id,
      `From the focused development itself, doubt must sit at the same level: ${JSON.stringify(fromFocus)}`
    );
    const fromModelFocus = await scopeRoutingRepository.findScopeDependency(priceIntentName, models[0].id);
    assert(
      fromModelFocus === null,
      `From a model already focused, its own price answers directly: ${JSON.stringify(fromModelFocus)}`
    );

    // --- 1.4: dos desarrollos que comparten horario (definido solo en la
    // raíz): la pregunta de horario no tiene duda.
    const { data: secondDev, error: secondDevError } = await supabaseServer
      .from('scopes')
      .insert({ parent_id: ROOT_SCOPE_ID, name: `Otro ${suffix}`, slug: `otro-${suffix}`, is_active: true })
      .select('id')
      .single();
    if (secondDevError) throw secondDevError;
    createdScopeIds.push(secondDev.id);
    scopeRepository.invalidateCache();

    const scheduleIntentName = `dep_schedule_${suffix}`;
    const { data: scheduleIntent, error: scheduleIntentError } = await supabaseServer
      .from('intent_configurations')
      .insert({ scope_id: ROOT_SCOPE_ID, intent_name: scheduleIntentName, display_name: 'Horario', keywords: ['y'], is_active: true, is_checkpoint: false })
      .select('id')
      .single();
    if (scheduleIntentError) throw scheduleIntentError;
    createdIntentIds.push(scheduleIntent.id);
    const { error: scheduleResponseError } = await supabaseServer.from('bot_responses').insert({
      intent_id: scheduleIntent.id,
      response_key: 'main',
      message_text: 'horario-comun',
      response_type: 'simple',
      is_active: true,
    });
    if (scheduleResponseError) throw scheduleResponseError;

    const scheduleDependency = await scopeRoutingRepository.findScopeDependency(scheduleIntentName, null);
    assert(
      scheduleDependency === null,
      `A shared schedule must not raise a doubt: ${JSON.stringify(scheduleDependency)}`
    );

    // --- La forma que produce el compilador de verdad: el precio vive en los
    // modelos, no en los desarrollos. Mirando solo al hijo inmediato, ningún
    // desarrollo definía nada y la raíz quedaba "sin duda": el lead recibía los
    // precios de los dos desarrollos seguidos, sin decir cuál era de cuál.
    const { data: secondModels, error: secondModelsError } = await supabaseServer
      .from('scopes')
      .insert([
        { parent_id: secondDev.id, name: `ModeloC ${suffix}`, slug: `modelo-c-${suffix}`, is_active: true },
        { parent_id: secondDev.id, name: `ModeloD ${suffix}`, slug: `modelo-d-${suffix}`, is_active: true },
      ])
      .select('id');
    if (secondModelsError) throw secondModelsError;
    createdScopeIds.push(...secondModels.map(m => m.id));
    scopeRepository.invalidateCache();

    const { data: secondPriceIntents, error: secondPriceIntentsError } = await supabaseServer
      .from('intent_configurations')
      .insert(secondModels.map((model, index) => ({
        scope_id: model.id,
        intent_name: priceIntentName,
        display_name: `CD${index}`,
        keywords: ['x'],
        is_active: true,
        is_checkpoint: false,
      })))
      .select('id, scope_id');
    if (secondPriceIntentsError) throw secondPriceIntentsError;
    createdIntentIds.push(...secondPriceIntents.map(i => i.id));
    const { error: secondPriceResponsesError } = await supabaseServer.from('bot_responses').insert(
      secondPriceIntents.map(intent => ({
        intent_id: intent.id,
        response_key: 'main',
        message_text: `precio-${intent.scope_id}`,
        response_type: 'simple',
        is_active: true,
      }))
    );
    if (secondPriceResponsesError) throw secondPriceResponsesError;

    const leafDependency = await scopeRoutingRepository.findScopeDependency(priceIntentName, null);
    assert(
      leafDependency !== null && leafDependency.level === ROOT_SCOPE_ID,
      `With the price living in the leaves, the doubt must sit at the root: ${JSON.stringify(leafDependency)}`
    );
    assert(
      new Set(leafDependency!.candidateIds).size === 2 &&
      [singleDev.id, secondDev.id].every(id => leafDependency!.candidateIds.includes(id)),
      'The candidates must be the two developments, not their models'
    );

    console.log('Scope dependency verification passed');
  } finally {
    if (createdIntentIds.length > 0) {
      await supabaseServer.from('bot_responses').delete().in('intent_id', createdIntentIds);
      await supabaseServer.from('intent_configurations').delete().in('id', createdIntentIds);
    }
    if (createdScopeIds.length > 0) {
      await supabaseServer.from('scopes').delete().in('id', createdScopeIds);
    }
    for (const scope of existingScopeStates) {
      await supabaseServer
        .from('scopes')
        .update({ is_active: scope.is_active ?? true })
        .eq('id', scope.id);
    }
    scopeRepository.invalidateCache();
  }
}

main().catch(error => {
  console.error('Scope dependency verification failed:', error);
  process.exit(1);
});
