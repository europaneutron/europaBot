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

function webhookPayload(referralAdId?: string) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        value: {
          contacts: [{ profile: { name: 'Routing Test' } }],
          messages: [{
            from: '5210000000000',
            id: 'wamid.routing-test',
            type: 'text',
            text: { body: 'hola' },
            ...(referralAdId ? { referral: { source_id: referralAdId } } : {}),
          }],
        },
      }],
    }],
  };
}

async function main(): Promise<void> {
  const { supabaseServer } = await import('../src/services/supabase/server-client');
  const { webhookValidator } = await import('../src/services/whatsapp/webhook-validator');
  const { messageProcessor } = await import('../src/core/conversation/message-processor');
  const { scopeRoutingService } = await import('../src/core/conversation/scope-routing.service');
  const { scopeRoutingRepository } = await import('../src/data/repositories/scope-routing.repository');
  const { scopeRepository, ROOT_SCOPE_ID } = await import('../src/data/repositories/scope.repository');
  const { intentDetectionService } = await import('../src/core/intent-engine/intent-detection.service');
  const { interpolateMessage } = await import('../src/lib/interpolate-message');

  const suffix = Date.now().toString(36);
  const phones = {
    baseline: `rb${suffix}`,
    knownAd: `ra${suffix}`,
    unknownAd: `ru${suffix}`,
    greeting: `rg${suffix}`,
    expiry: `re${suffix}`,
    apiAlpha: `rx${suffix}`,
    apiBeta: `ry${suffix}`,
    supersede: `rs${suffix}`,
    stale: `rt${suffix}`,
    variables: `rv${suffix}`,
    nested: `rn${suffix}`,
  };
  const createdScopeIds: string[] = [];
  const createdIntentIds: string[] = [];
  const existingScopeStates: Array<{ id: string; is_active: boolean }> = [];
  let previousTypingValue = 'true';
  let previousAutoOfferValue = 'true';

  const setConfig = async (key: string, value: string) => {
    const { error } = await supabaseServer
      .from('bot_config')
      .update({ config_value: value })
      .eq('config_key', key);
    if (error) throw error;
  };

  try {
    const extractedKnown = webhookValidator.extractMessage(webhookPayload(`ad-${suffix}`));
    const extractedPlain = webhookValidator.extractMessage(webhookPayload());
    assert(extractedKnown?.referralAdId === `ad-${suffix}`, 'Webhook must preserve referral.source_id');
    assert(extractedPlain?.referralAdId === undefined, 'Webhook without referral must preserve its old contract');
    assert(
      interpolateMessage('Hola {nombre}, {faltante}', { nombre: 'Ana' }) === 'Hola Ana, ',
      'Interpolation must replace known variables and hide missing ones'
    );

    const { data: configRows, error: configError } = await supabaseServer
      .from('bot_config')
      .select('config_key, config_value')
      .in('config_key', ['typing_indicator_enabled', 'appointment_auto_offer_enabled']);
    if (configError) throw configError;
    previousTypingValue = configRows?.find(row => row.config_key === 'typing_indicator_enabled')?.config_value ?? 'true';
    previousAutoOfferValue = configRows?.find(row => row.config_key === 'appointment_auto_offer_enabled')?.config_value ?? 'true';
    await setConfig('typing_indicator_enabled', 'false');
    await setConfig('appointment_auto_offer_enabled', 'false');

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

    const baseline = await messageProcessor.processMessage(
      phones.baseline,
      'hola',
      `baseline-${suffix}`,
      'Baseline Test'
    );
    assert(baseline.scopeId === ROOT_SCOPE_ID, 'A single active scope must keep root behavior');
    assert(baseline.responses.length === 1, 'A single active scope must not add a scope choice');

    const { data: scopes, error: scopesError } = await supabaseServer
      .from('scopes')
      .insert([
        { parent_id: ROOT_SCOPE_ID, name: `Alpha ${suffix}`, slug: `alpha-${suffix}`, is_active: true },
        { parent_id: ROOT_SCOPE_ID, name: `Beta ${suffix}`, slug: `beta-${suffix}`, is_active: true },
        { parent_id: ROOT_SCOPE_ID, name: `Inactive ${suffix}`, slug: `inactive-${suffix}`, is_active: false },
      ])
      .select('id, name, is_active');
    if (scopesError) throw scopesError;
    createdScopeIds.push(...scopes.map(scope => scope.id));
    const alphaId = scopes[0].id;
    const betaId = scopes[1].id;
    const inactiveId = scopes[2].id;

    const { error: aliasError } = await supabaseServer.from('scope_aliases').insert([
      { scope_id: alphaId, alias: `alpha${suffix}`, normalized_alias: `alpha${suffix}` },
      { scope_id: betaId, alias: `beta${suffix}`, normalized_alias: `beta${suffix}` },
      { scope_id: alphaId, alias: `shared${suffix}`, normalized_alias: `shared${suffix}` },
      { scope_id: betaId, alias: `shared${suffix}`, normalized_alias: `shared${suffix}` },
      { scope_id: inactiveId, alias: `inactive${suffix}`, normalized_alias: `inactive${suffix}` },
    ]);
    if (aliasError) throw aliasError;

    const knownAdId = `known-${suffix}`;
    const inactiveAdId = `inactive-${suffix}`;
    const { error: adError } = await supabaseServer.from('scope_ads').insert([
      { ad_id: knownAdId, scope_id: alphaId },
      { ad_id: inactiveAdId, scope_id: inactiveId },
    ]);
    if (adError) throw adError;

    const intentName = `routing_price_${suffix}`;
    const keyword = `price${suffix}`;
    const placeIntentName = `routing_place_${suffix}`;
    const placeKeyword = `place${suffix}`;
    const { data: intents, error: intentsError } = await supabaseServer
      .from('intent_configurations')
      .insert([
        { scope_id: alphaId, intent_name: intentName, display_name: 'Alpha price', keywords: [keyword], is_active: true, is_checkpoint: false },
        { scope_id: betaId, intent_name: intentName, display_name: 'Beta price', keywords: [keyword], is_active: true, is_checkpoint: false },
        { scope_id: alphaId, intent_name: placeIntentName, display_name: 'Alpha place', keywords: [placeKeyword], is_active: true, is_checkpoint: false },
        { scope_id: betaId, intent_name: placeIntentName, display_name: 'Beta place', keywords: [placeKeyword], is_active: true, is_checkpoint: false },
      ])
      .select('id, scope_id, intent_name');
    if (intentsError) throw intentsError;
    createdIntentIds.push(...intents.map(intent => intent.id));
    const responseTextFor = (intent: { scope_id: string; intent_name: string }) => (
      `${intent.scope_id === alphaId ? 'alpha' : 'beta'}-`
      + `${intent.intent_name === intentName ? 'response' : 'place'}-${suffix}`
    );
    const { error: responsesError } = await supabaseServer.from('bot_responses').insert(
      intents.map(intent => ({
        intent_id: intent.id,
        response_key: 'main',
        message_text: responseTextFor(intent),
        response_type: 'simple',
      }))
    );
    if (responsesError) throw responsesError;
    scopeRepository.invalidateCache();
    intentDetectionService.invalidateAll();

    const knownAd = await messageProcessor.processMessage(
      phones.knownAd,
      keyword,
      `known-ad-${suffix}`,
      'Known Ad Test',
      { referralAdId: knownAdId }
    );
    assert(knownAd.scopeId === alphaId, 'Known ad must establish its active scope');
    assert(knownAd.responses.includes(`alpha-response-${suffix}`), 'Known ad must resolve content from its scope');

    const changedFocus = await messageProcessor.processMessage(
      phones.knownAd,
      `${keyword} beta${suffix}`,
      `change-${suffix}`,
      'Known Ad Test'
    );
    assert(changedFocus.scopeId === betaId, 'Explicit alias must change focus without a referral');
    assert(changedFocus.responses.includes(`beta-response-${suffix}`), 'Changed focus must resolve the new scope content');

    const returnedFocus = await messageProcessor.processMessage(
      phones.knownAd,
      `${keyword} alpha${suffix}`,
      `return-${suffix}`,
      'Known Ad Test'
    );
    assert(returnedFocus.scopeId === alphaId, 'A later alias must return to the previous scope');
    const { data: returnedSession, error: returnedSessionError } = await supabaseServer
      .from('user_sessions')
      .select('current_scope_id, previous_scope_id')
      .eq('user_id', (await supabaseServer.from('users').select('id').eq('phone_number', phones.knownAd).single()).data!.id)
      .single();
    if (returnedSessionError) throw returnedSessionError;
    assert(returnedSession.current_scope_id === alphaId, 'Session must persist the current focus');
    assert(returnedSession.previous_scope_id === betaId, 'Session must preserve the previous focus');

    const unknownAd = await messageProcessor.processMessage(
      phones.unknownAd,
      keyword,
      `unknown-${suffix}`,
      'Unknown Ad Test',
      { referralAdId: `unknown-${suffix}` }
    );
    assert(unknownAd.responses[0]?.toString().includes('¿De cuál'), 'Unknown ad must fall through to disambiguation');

    const resumed = await messageProcessor.processMessage(
      phones.unknownAd,
      `bet${suffix}`,
      `resume-${suffix}`,
      'Unknown Ad Test'
    );
    assert(resumed.scopeId === betaId, 'A fuzzy alias must establish focus');
    assert(resumed.responses.includes(`beta-response-${suffix}`), 'The pending question must resume after choosing a scope');

    // El lead elige alcance y de paso pregunta otra cosa. Su pregunta nueva
    // manda; contestarle la retenida descartaria en silencio lo que acaba de
    // escribir.
    const superseding = await messageProcessor.processMessage(
      phones.supersede,
      keyword,
      `supersede-ask-${suffix}`,
      'Supersede Test'
    );
    assert(
      superseding.responses[0]?.toString().includes('¿De cuál'),
      'A scope-dependent question without focus must ask which scope'
    );
    const superseded = await messageProcessor.processMessage(
      phones.supersede,
      `${placeKeyword} beta${suffix}`,
      `supersede-new-${suffix}`,
      'Supersede Test'
    );
    assert(superseded.scopeId === betaId, 'The new question must still establish focus');
    assert(
      superseded.responses.includes(`beta-place-${suffix}`),
      'A new question must be answered instead of the pending one'
    );
    const supersedeUserId = (await supabaseServer.from('users').select('id').eq('phone_number', phones.supersede).single()).data!.id;
    const { data: supersedeSession } = await supabaseServer
      .from('user_sessions')
      .select('pending_scope_message')
      .eq('user_id', supersedeUserId)
      .single();
    assert(
      supersedeSession?.pending_scope_message === null,
      'A superseded question must not stay pending'
    );

    // Una pregunta retenida caduca con la misma ventana que el foco: reanudarla
    // dias despues seria contestar algo que el lead ya no esta preguntando.
    const staleAsk = await messageProcessor.processMessage(
      phones.stale,
      keyword,
      `stale-ask-${suffix}`,
      'Stale Test'
    );
    assert(staleAsk.responses[0]?.toString().includes('¿De cuál'), 'Stale case must start from a disambiguation');
    const staleUserId = (await supabaseServer.from('users').select('id').eq('phone_number', phones.stale).single()).data!.id;
    await supabaseServer.from('user_sessions').update({
      pending_scope_updated_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    }).eq('user_id', staleUserId);
    const staleReturn = await messageProcessor.processMessage(
      phones.stale,
      `beta${suffix}`,
      `stale-return-${suffix}`,
      'Stale Test'
    );
    assert(staleReturn.scopeId === betaId, 'A returning lead must still establish focus');
    assert(
      !staleReturn.responses.includes(`beta-response-${suffix}`),
      'An expired pending question must not be resumed'
    );

    // Las variables de una respuesta se resuelven con el contexto de la
    // conversacion, no solo con la lista de alcances.
    const alphaPriceIntent = intents.find(
      intent => intent.scope_id === alphaId && intent.intent_name === intentName
    )!;
    const { error: variableError } = await supabaseServer
      .from('bot_responses')
      .update({ message_text: `Hola {nombre}, {saludo_fijo} cuesta X` , variables: { saludo_fijo: `fijo-${suffix}` } })
      .eq('intent_id', alphaPriceIntent.id);
    if (variableError) throw variableError;
    const interpolated = await messageProcessor.processMessage(
      phones.variables,
      `alpha${suffix} ${keyword}`,
      `variables-${suffix}`,
      'Ana'
    );
    assert(
      interpolated.responses.includes(`Hola Ana, fijo-${suffix} cuesta X`),
      `Response variables must resolve from context and from the response row: ${JSON.stringify(interpolated.responses)}`
    );
    await supabaseServer
      .from('bot_responses')
      .update({ message_text: `alpha-response-${suffix}`, variables: null })
      .eq('intent_id', alphaPriceIntent.id);

    const greeting = await messageProcessor.processMessage(
      phones.greeting,
      'hola',
      `greeting-${suffix}`,
      'Greeting Test'
    );
    assert(greeting.responses.length === 2, 'Greeting without focus must append the configured scope presentation');
    assert(
      greeting.responses.some(response => typeof response === 'string' && response.includes(`Alpha ${suffix}`) && response.includes(`Beta ${suffix}`)),
      'Greeting must compose the active scope names from data'
    );

    const { data: expiryUser, error: expiryUserError } = await supabaseServer
      .from('users')
      .select('id')
      .eq('phone_number', phones.expiry)
      .maybeSingle();
    let expiryUserId = expiryUser?.id;
    if (!expiryUserId) {
      const { userRepository } = await import('../src/data/repositories/user.repository');
      expiryUserId = (await userRepository.findOrCreateByPhone(phones.expiry, 'Expiry Test')).id;
    }
    if (expiryUserError) throw expiryUserError;

    const { conversationRepository } = await import('../src/data/repositories/conversation.repository');
    await conversationRepository.saveIncomingMessage(
      expiryUserId,
      `history-${suffix}`,
      'mensaje histórico',
      undefined,
      { scopeId: alphaId }
    );

    await supabaseServer.from('user_sessions').update({
      current_scope_id: alphaId,
      scope_focus_updated_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    }).eq('user_id', expiryUserId);
    const expired = await scopeRoutingService.resolve({ userId: expiryUserId, message: 'sin referencia' });
    assert(!expired.hasFocus && expired.scopeId === ROOT_SCOPE_ID, 'Focus must expire after 24 hours');
    const { count: historyCount, error: historyError } = await supabaseServer
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', expiryUserId);
    if (historyError) throw historyError;
    assert(historyCount === 1, 'Focus expiration must not remove conversation history');

    await supabaseServer.from('user_sessions').update({
      current_scope_id: alphaId,
      scope_focus_updated_at: new Date().toISOString(),
    }).eq('user_id', expiryUserId);
    const fresh = await scopeRoutingService.resolve({ userId: expiryUserId, message: 'sin referencia' });
    assert(fresh.hasFocus && fresh.scopeId === alphaId, 'Focus must survive inside the 24-hour window');

    const ambiguous = await scopeRoutingService.resolve({
      userId: expiryUserId,
      message: `shared${suffix}`,
    });
    assert(ambiguous.aliasAmbiguous, 'An alias shared by active scopes must be reported as ambiguous');
    assert(ambiguous.scopeId === alphaId, 'An ambiguous alias must preserve the current focus');

    const inactiveAlias = await scopeRoutingService.resolve({
      userId: expiryUserId,
      message: `inactive${suffix}`,
    });
    assert(inactiveAlias.scopeId === alphaId, 'An inactive scope alias must not change focus');

    const inactiveAd = await scopeRoutingService.resolve({
      userId: expiryUserId,
      message: 'sin referencia',
      referralAdId: inactiveAdId,
    });
    assert(inactiveAd.scopeId === alphaId, 'An inactive ad mapping must fall through to the current focus');

    const { data: tracedMessages, error: traceError } = await supabaseServer
      .from('conversations')
      .select('scope_id, referral_ad_id')
      .eq('user_id', (await supabaseServer.from('users').select('id').eq('phone_number', phones.knownAd).single()).data!.id)
      .eq('message_id', `known-ad-${suffix}`);
    if (traceError) throw traceError;
    assert(tracedMessages?.[0]?.scope_id === alphaId, 'Inbound conversation must record its resolved scope');
    assert(tracedMessages?.[0]?.referral_ad_id === knownAdId, 'Inbound conversation must record its referral ad');

    // Arbol de tres niveles. Lo que cuelga de un desarrollo es granularidad
    // interna: sirve como foco, pero no es una alternativa que ofrecer al lead.
    const { data: nestedScopes, error: nestedError } = await supabaseServer
      .from('scopes')
      .insert([{ parent_id: alphaId, name: `Torre ${suffix}`, slug: `torre-${suffix}`, is_active: true }])
      .select('id');
    if (nestedError) throw nestedError;
    const towerId = nestedScopes[0].id;
    createdScopeIds.push(towerId);
    const { error: towerAliasError } = await supabaseServer.from('scope_aliases').insert([
      { scope_id: towerId, alias: `torre${suffix}`, normalized_alias: `torre${suffix}` },
    ]);
    if (towerAliasError) throw towerAliasError;

    const nestedIntentName = `routing_nested_${suffix}`;
    const nestedKeyword = `nested${suffix}`;
    const { data: nestedIntents, error: nestedIntentsError } = await supabaseServer
      .from('intent_configurations')
      .insert([
        { scope_id: alphaId, intent_name: nestedIntentName, display_name: 'Alpha nested', keywords: [nestedKeyword], is_active: true, is_checkpoint: false },
        { scope_id: towerId, intent_name: nestedIntentName, display_name: 'Tower nested', keywords: [nestedKeyword], is_active: true, is_checkpoint: false },
      ])
      .select('id, scope_id');
    if (nestedIntentsError) throw nestedIntentsError;
    createdIntentIds.push(...nestedIntents.map(intent => intent.id));
    const { error: nestedResponsesError } = await supabaseServer.from('bot_responses').insert(
      nestedIntents.map(intent => ({
        intent_id: intent.id,
        response_key: 'main',
        message_text: intent.scope_id === alphaId ? `alpha-nested-${suffix}` : `tower-nested-${suffix}`,
        response_type: 'simple',
      }))
    );
    if (nestedResponsesError) throw nestedResponsesError;
    scopeRepository.invalidateCache();
    intentDetectionService.invalidateAll();

    const branches = await scopeRoutingRepository.getAvailableScopes();
    assert(branches.length === 2, `Only first-level branches are available: ${branches.map(b => b.name).join(', ')}`);
    assert(
      !branches.some(branch => branch.id === towerId),
      'A nested scope must not be offered as an alternative to its own development'
    );

    const nestedGreeting = await messageProcessor.processMessage(
      phones.nested,
      'hola',
      `nested-greeting-${suffix}`,
      'Nested Test'
    );
    assert(
      !nestedGreeting.responses.some(response => typeof response === 'string' && response.includes(`Torre ${suffix}`)),
      'The greeting must not list a scope nested inside a development'
    );

    assert(
      await scopeRoutingRepository.isIntentScopeDependent(intentName),
      'An intent answered by two different branches depends on the scope'
    );
    assert(
      !await scopeRoutingRepository.isIntentScopeDependent(nestedIntentName),
      'An intent answered twice inside the same branch does not depend on the scope'
    );

    // Una intención que solo existe en un sub-alcance tiene que seguir siendo
    // detectable sin foco; acotar el menú a las ramas no puede volverla invisible.
    const towerOnlyName = `routing_tower_only_${suffix}`;
    const towerOnlyKeyword = `toweronly${suffix}`;
    const { data: towerOnlyIntents, error: towerOnlyError } = await supabaseServer
      .from('intent_configurations')
      .insert([{ scope_id: towerId, intent_name: towerOnlyName, display_name: 'Tower only', keywords: [towerOnlyKeyword], is_active: true, is_checkpoint: false }])
      .select('id');
    if (towerOnlyError) throw towerOnlyError;
    createdIntentIds.push(towerOnlyIntents[0].id);
    const { error: towerOnlyResponseError } = await supabaseServer.from('bot_responses').insert([{
      intent_id: towerOnlyIntents[0].id,
      response_key: 'main',
      message_text: `tower-only-${suffix}`,
      response_type: 'simple',
    }]);
    if (towerOnlyResponseError) throw towerOnlyResponseError;
    intentDetectionService.invalidateAll();

    const towerOnly = await messageProcessor.processMessage(
      phones.nested,
      towerOnlyKeyword,
      `tower-only-${suffix}`,
      'Nested Test 2'
    );
    assert(
      towerOnly.responses.includes(`tower-only-${suffix}`),
      `An intent defined only in a nested scope must stay detectable: ${JSON.stringify(towerOnly.responses)}`
    );

    const towerFocus = await messageProcessor.processMessage(
      phones.nested,
      `torre${suffix} ${nestedKeyword}`,
      `nested-focus-${suffix}`,
      'Nested Test'
    );
    assert(towerFocus.scopeId === towerId, 'A nested scope must still be reachable as a focus by its alias');
    assert(towerFocus.responses.includes(`tower-nested-${suffix}`), 'A nested focus must resolve its own content');

    // Desactivar el desarrollo tiene que retirar con el todo lo que cuelga.
    const { error: deactivateError } = await supabaseServer
      .from('scopes')
      .update({ is_active: false })
      .eq('id', alphaId);
    if (deactivateError) throw deactivateError;
    scopeRepository.invalidateCache();
    intentDetectionService.invalidateAll();

    const orphanedFocus = await scopeRoutingService.resolve({
      userId: expiryUserId,
      message: `torre${suffix}`,
    });
    assert(
      orphanedFocus.scopeId !== towerId,
      'A scope under a deactivated development must stop changing the focus'
    );
    const branchesAfter = await scopeRoutingRepository.getAvailableScopes();
    assert(
      branchesAfter.length === 1 && branchesAfter[0].id === betaId,
      'Deactivating a development must leave only the remaining branch available'
    );

    const { error: reactivateError } = await supabaseServer
      .from('scopes')
      .update({ is_active: true })
      .eq('id', alphaId);
    if (reactivateError) throw reactivateError;
    scopeRepository.invalidateCache();
    intentDetectionService.invalidateAll();

    const { NextRequest } = await import('next/server');
    const { POST: processMessageEndpoint } = await import('../src/app/api/test/process-message/route');
    for (const [phoneNumber, requestedScopeId, expectedResponse] of [
      [phones.apiAlpha, alphaId, `alpha-response-${suffix}`],
      [phones.apiBeta, betaId, `beta-response-${suffix}`],
    ] as const) {
      // El endpoint exige sesion de administrador desde que lo usa el
      // simulador, asi que sin cookies responde 401. Esa es la puerta; la
      // resolucion por alcance se comprueba por el mismo camino que el
      // endpoint recorre despues de abrirla.
      const endpointResponse = await processMessageEndpoint(new NextRequest(
        'http://localhost/api/test/process-message',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ phoneNumber, message: keyword, scopeId: requestedScopeId }),
        }
      ));
      assert(endpointResponse.status === 401, 'Test endpoint must reject requests without an admin session');

      const processed = await messageProcessor.processMessage(
        phoneNumber,
        keyword,
        `wamid.api-${suffix}-${phoneNumber}`,
        undefined,
        { scopeId: requestedScopeId, suppressExternalMessages: true }
      );
      assert(processed.scopeId === requestedScopeId, 'Requested scope must be the resolved scope');
      assert(processed.responses.includes(expectedResponse), 'Each scope must resolve its own content');
    }

    console.log('Scope routing verification passed');
  } finally {
    await setConfig('typing_indicator_enabled', previousTypingValue).catch(() => {});
    await setConfig('appointment_auto_offer_enabled', previousAutoOfferValue).catch(() => {});
    await supabaseServer.from('users').delete().in('phone_number', Object.values(phones));
    if (createdIntentIds.length > 0) {
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
    intentDetectionService.invalidateAll();
  }
}

main().catch(error => {
  console.error('Scope routing verification failed:', error);
  process.exit(1);
});
