import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.development.local') });
config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!supabaseUrl || (!supabaseUrl.includes('127.0.0.1') && !supabaseUrl.includes('localhost'))) {
  console.error('NEXT_PUBLIC_SUPABASE_URL must point to the local stack');
  process.exit(1);
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const { supabaseServer } = await import('../src/services/supabase/server-client');
  const { intentDetectionService } = await import('../src/core/intent-engine/intent-detection.service');
  const { conversationRepository } = await import('../src/data/repositories/conversation.repository');
  const { resourceRepository } = await import('../src/data/repositories/resource.repository');
  const { appointmentRepository } = await import('../src/data/repositories/appointment.repository');
  const { fallbackHandler } = await import('../src/core/fallback/fallback-handler');
  const { userRepository } = await import('../src/data/repositories/user.repository');
  const { scopeRepository, ROOT_SCOPE_ID } = await import('../src/data/repositories/scope.repository');

  const suffix = Date.now().toString(36);
  const inheritedName = `scope_inherited_${suffix}`;
  const overriddenName = `scope_override_${suffix}`;
  const responseInheritedName = `scope_response_${suffix}`;
  const inheritedKeyword = `inherit${suffix}`;
  const childKeyword = `child${suffix}`;
  const responseInheritedKeyword = `response${suffix}`;
  const globalIntentName = `scope_global_${suffix}`;
  const globalIntentKeyword = `global${suffix}`;
  const phoneNumber = `scope-test-${suffix}`;
  const degradedPhoneNumber = `scope-d-${suffix}`;
  let childId: string | null = null;
  let grandchildId: string | null = null;
  let inactiveBridgeId: string | null = null;
  let activeLeafId: string | null = null;
  const intentIds: string[] = [];
  const responseIds: string[] = [];
  const resourceIds: string[] = [];
  let agentId: number | null = null;
  let appointmentConfigId: number | null = null;
  let originalContactConfigs: Array<{ config_key: string; config_value: string }> = [];
  let rootAgentStates: Array<{ id: number; is_active: boolean }> = [];

  const setBotConfig = async (key: string, value: string): Promise<void> => {
    const { error } = await supabaseServer
      .from('bot_config')
      .update({ config_value: value })
      .eq('config_key', key);
    if (error) throw error;
  };

  try {
    const { data: contactConfigs, error: contactConfigsError } = await supabaseServer
      .from('bot_config')
      .select('config_key, config_value')
      .in('config_key', ['advisor_phone', 'business_hours', 'advisor_email']);
    if (contactConfigsError) throw contactConfigsError;
    originalContactConfigs = contactConfigs || [];

    const { data: rootAgents, error: rootAgentsError } = await supabaseServer
      .from('agent_config')
      .select('id, is_active')
      .eq('scope_id', ROOT_SCOPE_ID);
    if (rootAgentsError) throw rootAgentsError;
    rootAgentStates = rootAgents || [];
    if (rootAgentStates.length) {
      const { error } = await supabaseServer
        .from('agent_config')
        .update({ is_active: false })
        .in('id', rootAgentStates.map(agent => agent.id));
      if (error) throw error;
    }

    await setBotConfig('advisor_phone', '+525500000090');
    await setBotConfig('business_hours', 'Horario global inicial');
    await setBotConfig('advisor_email', 'global@example.com');

    await scopeRepository.getScopes(supabaseServer);
    const { data: child, error: childError } = await supabaseServer
      .from('scopes')
      .insert({ parent_id: ROOT_SCOPE_ID, name: `Scope Test ${suffix}`, slug: `scope-test-${suffix}` })
      .select('id')
      .single();
    if (childError) throw childError;
    childId = child.id;
    assert(
      await scopeRepository.isActiveScope(child.id, supabaseServer),
      'A newly created scope must be visible immediately after one cache reload'
    );

    const globalOnlyAgent = await appointmentRepository.getDefaultAgent(childId);
    assert(globalOnlyAgent.advisor_phone === '+525500000090', 'bot_config must provide the global advisor');
    assert(globalOnlyAgent.business_hours === 'Horario global inicial', 'bot_config must provide global business hours');
    assert(globalOnlyAgent.advisor_email === 'global@example.com', 'bot_config must provide the global advisor email');

    await setBotConfig('advisor_phone', '+525500000091');
    await setBotConfig('business_hours', 'Horario editado en Ajustes');
    const editedGlobalAgent = await appointmentRepository.getDefaultAgent(childId);
    assert(editedGlobalAgent.advisor_phone === '+525500000091', 'Settings edits must be visible immediately');
    assert(editedGlobalAgent.business_hours === 'Horario editado en Ajustes', 'Edited business hours must bypass stale server cache');

    const { data: grandchild, error: grandchildError } = await supabaseServer
      .from('scopes')
      .insert({ parent_id: childId, name: `Scope Variant ${suffix}`, slug: `scope-variant-${suffix}`, scope_type: 'variant' })
      .select('id')
      .single();
    if (grandchildError) throw grandchildError;
    grandchildId = grandchild.id;

    const { data: inactiveBridge, error: inactiveBridgeError } = await supabaseServer
      .from('scopes')
      .insert({ parent_id: ROOT_SCOPE_ID, name: `Inactive Bridge ${suffix}`, slug: `inactive-bridge-${suffix}`, is_active: false })
      .select('id')
      .single();
    if (inactiveBridgeError) throw inactiveBridgeError;
    inactiveBridgeId = inactiveBridge.id;

    const activeLeaf = await scopeRepository.create(
      { parent_id: inactiveBridgeId, name: `Active Leaf ${suffix}`, slug: `active-leaf-${suffix}` },
      supabaseServer
    );
    activeLeafId = activeLeaf.id;
    const activeLeafOrder = await scopeRepository.getResolutionOrder(activeLeaf.id, supabaseServer);
    assert(
      activeLeafOrder.includes(ROOT_SCOPE_ID),
      'The scope creation write path must invalidate the cached tree'
    );

    await scopeRepository.reparent(grandchild.id, inactiveBridge.id, supabaseServer);
    const reparentedOrder = await scopeRepository.getResolutionOrder(grandchildId, supabaseServer);
    assert(!reparentedOrder.includes(childId), 'Reparenting must take effect without restarting');
    assert(reparentedOrder.includes(ROOT_SCOPE_ID), 'Reparented scope must inherit from its new ancestry');
    await scopeRepository.reparent(grandchild.id, child.id, supabaseServer);
    const restoredOrder = await scopeRepository.getResolutionOrder(grandchildId, supabaseServer);
    assert(restoredOrder.includes(childId), 'Restoring a parent must invalidate the cached tree');

    const { error: cycleError } = await supabaseServer
      .from('scopes')
      .update({ parent_id: grandchildId })
      .eq('id', childId);
    assert(!!cycleError, 'Database must reject a cycle in the scope hierarchy');

    const { data: intents, error: intentsError } = await supabaseServer
      .from('intent_configurations')
      .insert([
        {
          scope_id: ROOT_SCOPE_ID,
          intent_name: inheritedName,
          display_name: 'Inherited scope test',
          keywords: [inheritedKeyword],
          is_checkpoint: false,
          is_active: true,
        },
        {
          scope_id: ROOT_SCOPE_ID,
          intent_name: overriddenName,
          display_name: 'Root override test',
          keywords: [`root${suffix}`],
          is_checkpoint: false,
          is_active: true,
        },
        {
          scope_id: childId,
          intent_name: overriddenName,
          display_name: 'Child override test',
          keywords: [childKeyword],
          is_checkpoint: false,
          is_active: true,
        },
        {
          scope_id: ROOT_SCOPE_ID,
          intent_name: responseInheritedName,
          display_name: 'Root response inheritance test',
          keywords: [`rootresponse${suffix}`],
          is_checkpoint: false,
          is_active: true,
        },
        {
          scope_id: childId,
          intent_name: responseInheritedName,
          display_name: 'Child response inheritance test',
          keywords: [responseInheritedKeyword],
          is_checkpoint: false,
          is_active: true,
        },
      ])
      .select('id, intent_name, scope_id');
    if (intentsError) throw intentsError;
    intentIds.push(...intents.map(intent => intent.id));

    const emptyGlobalCache = await intentDetectionService.loadIntents(supabaseServer, null);
    assert(emptyGlobalCache.intents.length === 0, 'Global-only intent set must start empty for this verification');
    const { data: globalIntent, error: globalIntentError } = await supabaseServer
      .from('intent_configurations')
      .insert({
        scope_id: null,
        intent_name: globalIntentName,
        display_name: 'Global cache test',
        keywords: [globalIntentKeyword],
        is_checkpoint: false,
        is_active: true,
      })
      .select('id')
      .single();
    if (globalIntentError) throw globalIntentError;
    intentIds.push(globalIntent.id);
    const globalDetection = await intentDetectionService.detect(globalIntentKeyword, supabaseServer, null);
    assert(
      globalDetection.intent?.intent_id === globalIntent.id,
      'An empty matcher must not be cached after configuration becomes available'
    );

    const inheritedIntent = intents.find(intent => intent.intent_name === inheritedName)!;
    const childIntent = intents.find(intent => (
      intent.scope_id === childId && intent.intent_name === overriddenName
    ))!;
    const rootResponseIntent = intents.find(intent => (
      intent.intent_name === responseInheritedName && intent.scope_id === ROOT_SCOPE_ID
    ))!;
    const { data: responses, error: responsesError } = await supabaseServer
      .from('bot_responses')
      .insert([
        { intent_id: inheritedIntent.id, response_key: 'main', message_text: 'inherited response', response_type: 'simple' },
        { intent_id: childIntent.id, response_key: 'main', message_text: 'child response', response_type: 'simple' },
        { intent_id: rootResponseIntent.id, response_key: 'main', message_text: 'response inherited from root', response_type: 'simple' },
      ])
      .select('id');
    if (responsesError) throw responsesError;
    responseIds.push(...responses.map(response => response.id));

    const { error: ambiguousLegacyWriteError } = await supabaseServer
      .from('bot_responses')
      .insert({
        intent_name: overriddenName,
        response_key: 'ambiguous-legacy-write',
        message_text: 'must not be inserted',
        response_type: 'simple',
      });
    assert(!!ambiguousLegacyWriteError, 'Legacy writes must reject ambiguous intent names');

    const { error: legacyUpdateError } = await supabaseServer
      .from('bot_responses')
      .update({ intent_name: overriddenName })
      .eq('id', responses[0].id);
    assert(!!legacyUpdateError, 'Legacy intent_name updates on rows with intent_id must be rejected');

    const { data: resources, error: resourcesError } = await supabaseServer
      .from('resources')
      .insert([
        { scope_id: ROOT_SCOPE_ID, resource_type: 'document', intent_category: inheritedName, title: 'Root resource', file_url: 'https://example.com/root.pdf' },
        { scope_id: ROOT_SCOPE_ID, resource_type: 'document', intent_category: inheritedName, title: 'Root resource 2', file_url: 'https://example.com/root-2.pdf' },
        { scope_id: childId, resource_type: 'document', intent_category: inheritedName, title: 'Child resource 1', file_url: 'https://example.com/child-1.pdf' },
        { scope_id: childId, resource_type: 'document', intent_category: inheritedName, title: 'Child resource 2', file_url: 'https://example.com/child-2.pdf' },
        { scope_id: childId, resource_type: 'document', intent_category: inheritedName, title: 'Child resource 3', file_url: 'https://example.com/child-3.pdf' },
      ])
      .select('id');
    if (resourcesError) throw resourcesError;
    resourceIds.push(...resources.map(resource => resource.id));

    const { data: agent, error: agentError } = await supabaseServer
      .from('agent_config')
      .insert({
        scope_id: childId,
        default_agent_phone: '+525500000001',
        default_agent_name: 'Scope Agent',
        notification_template: 'Scope template',
        business_hours: null,
        advisor_phone: '+525500000002',
        advisor_email: 'scope@example.com',
        is_active: true,
      })
      .select('id')
      .single();
    if (agentError) throw agentError;
    agentId = agent.id;

    const { data: appointmentConfig, error: appointmentConfigError } = await supabaseServer
      .from('appointment_config')
      .insert({
        scope_id: childId,
        time_slot: 'morning',
        display_name: 'Scope Morning',
        start_time: '10:00',
        end_time: '12:00',
        display_order: 1,
        is_active: true,
      })
      .select('id')
      .single();
    if (appointmentConfigError) throw appointmentConfigError;
    appointmentConfigId = appointmentConfig.id;

    await intentDetectionService.refresh(supabaseServer, grandchildId);

    const inactiveBridgeOrder = await scopeRepository.getResolutionOrder(activeLeafId, supabaseServer);
    assert(inactiveBridgeOrder.includes(ROOT_SCOPE_ID), 'Inactive bridge must preserve access to root');
    assert(!inactiveBridgeOrder.includes(inactiveBridgeId), 'Inactive bridge must not contribute content');

    const inheritedDetection = await intentDetectionService.detect(inheritedKeyword, supabaseServer, grandchildId);
    const childDetection = await intentDetectionService.detect(childKeyword, supabaseServer, grandchildId);
    const responseInheritedDetection = await intentDetectionService.detect(
      responseInheritedKeyword,
      supabaseServer,
      grandchildId
    );
    assert(inheritedDetection.intent?.intent_id === inheritedIntent.id, 'Grandchild must inherit root intent');
    assert(childDetection.intent?.intent_id === childIntent.id, 'Child intent must override root intent');
    assert(responseInheritedDetection.intent?.scope_id === childId, 'Child matching rules must win');

    const inheritedResponses = await conversationRepository.getBotResponses(inheritedIntent.id);
    const childResponses = await conversationRepository.getBotResponses(childIntent.id);
    const inheritedContentResponses = await conversationRepository.getBotResponses(
      responseInheritedDetection.intent?.response_intent_ids || []
    );
    assert(inheritedResponses[0] === 'inherited response', 'Inherited intent response must resolve');
    assert(childResponses[0] === 'child response', 'Child response must resolve');
    assert(
      inheritedContentResponses[0] === 'response inherited from root',
      'Response content must fall back to the nearest ancestor that defines it'
    );

    const visibleResources = await resourceRepository.getVisible(grandchildId);
    const resolvedResources = visibleResources.filter(resource => resource.intent_category === inheritedName);
    assert(resolvedResources.length === 3, 'Closest resource set must preserve every child row');
    assert(
      resolvedResources.every(resource => resource.scope_id === childId),
      'Closest resource set must replace, not merge with, the parent set'
    );

    const resolvedAgent = await appointmentRepository.getDefaultAgent(grandchildId);
    assert(resolvedAgent.name === 'Scope Agent', 'Scoped agent config must be inherited');
    assert(resolvedAgent.advisor_phone === '+525500000002', 'Scoped advisor must override bot_config');
    assert(resolvedAgent.business_hours === 'Horario editado en Ajustes', 'Missing scoped business hours must fall back to Settings');
    assert(resolvedAgent.advisor_email === 'scope@example.com', 'Scoped advisor email must override bot_config');
    const resolvedSlots = await appointmentRepository.getTimeSlots(grandchildId);
    assert(
      resolvedSlots.find(slot => slot.time_slot === 'morning')?.display_name === 'Scope Morning',
      'Scoped appointment config must be inherited'
    );
    assert(
      resolvedSlots.some(slot => slot.time_slot === 'afternoon'),
      'Unmodified appointment slots must fall back to root'
    );

    const appointmentUser = await userRepository.findOrCreateByPhone(phoneNumber, 'Scope Test');
    const scopedAppointment = await appointmentRepository.create(
      {
        user_id: appointmentUser.id,
        visitor_name: 'Scope Test',
        requested_date: '2030-01-15',
        time_slot: 'morning',
      },
      grandchildId
    );
    const { data: storedAppointment, error: storedAppointmentError } = await supabaseServer
      .from('appointments')
      .select('time_slot_start, time_slot_end')
      .eq('id', scopedAppointment.id)
      .single();
    if (storedAppointmentError) throw storedAppointmentError;
    assert(
      storedAppointment.time_slot_start === '10:00:00',
      'Appointment creation must use the scoped time slot'
    );

    const fallbackHandlerForTest = fallbackHandler as unknown as {
      notifyAdvisor: (...args: unknown[]) => Promise<void>;
    };
    const originalNotifyAdvisor = fallbackHandlerForTest.notifyAdvisor;
    fallbackHandlerForTest.notifyAdvisor = async () => undefined;
    try {
      const fallbackResponse = await fallbackHandler.captureAdvisorName(
        appointmentUser.id,
        appointmentUser,
        'Scope Lead',
        { fallback_attempts: 3 } as any,
        grandchildId
      );
      assert(
        typeof fallbackResponse.responses[0] === 'string' &&
          fallbackResponse.responses[0].includes('Horario editado en Ajustes'),
        'Derivation confirmation must reflect business_hours edited in Settings'
      );
    } finally {
      fallbackHandlerForTest.notifyAdvisor = originalNotifyAdvisor;
    }

    const originalGetResolutionOrder = scopeRepository.getResolutionOrder.bind(scopeRepository);
    (scopeRepository as any).getResolutionOrder = async () => {
      throw new Error('simulated scope tree failure');
    };
    try {
      const degradedAgent = await appointmentRepository.getDefaultAgent(grandchildId);
      const degradedSlots = await appointmentRepository.getTimeSlots(grandchildId);
      assert(degradedAgent.advisor_phone === '+525500000091', 'Tree failures must degrade to bot_config');
      assert(degradedSlots.length > 0, 'Tree failures must degrade to root appointment slots');
    } finally {
      (scopeRepository as any).getResolutionOrder = originalGetResolutionOrder;
    }

    const { error: disableScopedAgentError } = await supabaseServer
      .from('agent_config')
      .update({ is_active: false })
      .eq('id', agentId);
    if (disableScopedAgentError) throw disableScopedAgentError;
    await setBotConfig('advisor_phone', '');
    let missingAdvisorError: unknown;
    try {
      await appointmentRepository.getDefaultAgent(grandchildId);
    } catch (error) {
      missingAdvisorError = error;
    }
    assert(
      missingAdvisorError instanceof Error && missingAdvisorError.message.includes('bot_config.advisor_phone'),
      'Missing advisor configuration must fail clearly without a test number'
    );
    const degradedUser = await userRepository.findOrCreateByPhone(degradedPhoneNumber, 'Degraded Lead');
    const degradedFallbackResponse = await fallbackHandler.captureAdvisorName(
      degradedUser.id,
      degradedUser,
      'Degraded Lead',
      { fallback_attempts: 3 } as any,
      grandchildId
    );
    assert(
      typeof degradedFallbackResponse.responses[0] === 'string' &&
        degradedFallbackResponse.responses[0].includes('Registramos tu solicitud') &&
        !degradedFallbackResponse.responses[0].includes('bot_config'),
      'A configuration failure must return a lead-safe response instead of a technical error'
    );
    await setBotConfig('advisor_phone', '+525500000091');
    const { error: enableScopedAgentError } = await supabaseServer
      .from('agent_config')
      .update({ is_active: true })
      .eq('id', agentId);
    if (enableScopedAgentError) throw enableScopedAgentError;

    if (process.argv.includes('--endpoint')) {
      const endpoint = process.env.SCOPE_TEST_API_URL || 'http://127.0.0.1:3000/api/test/process-message';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, message: childKeyword, scopeId: grandchildId }),
      });
      const payload = await response.json();
      assert(response.ok, `Test endpoint failed: ${JSON.stringify(payload)}`);
      assert(payload.intentId === childIntent.id, 'Test endpoint must use the requested scope');
      assert(payload.responses?.[0] === 'child response', 'Test endpoint must return scoped response');

      const invalidScopeResponse = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber,
          message: childKeyword,
          scopeId: '00000000-0000-4000-8000-000000000099',
        }),
      });
      assert(invalidScopeResponse.status === 400, 'Test endpoint must reject an unknown scope');

      const nullScopeResponse = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, message: inheritedKeyword, scopeId: null }),
      });
      assert(nullScopeResponse.status === 400, 'Test endpoint must reject an explicit null scope');

      const omittedScopeResponse = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, message: inheritedKeyword }),
      });
      assert(omittedScopeResponse.ok, 'Omitted scopeId must use the root scope successfully');
    }

    console.log('Scope tree integration verified');
  } finally {
    if (responseIds.length) await supabaseServer.from('bot_responses').delete().in('id', responseIds);
    if (resourceIds.length) await supabaseServer.from('resources').delete().in('id', resourceIds);
    if (intentIds.length) await supabaseServer.from('intent_configurations').delete().in('id', intentIds);
    if (agentId !== null) await supabaseServer.from('agent_config').delete().eq('id', agentId);
    if (appointmentConfigId !== null) await supabaseServer.from('appointment_config').delete().eq('id', appointmentConfigId);
    await supabaseServer.from('users').delete().eq('phone_number', phoneNumber);
    await supabaseServer.from('users').delete().eq('phone_number', degradedPhoneNumber);
    if (grandchildId) await supabaseServer.from('scopes').delete().eq('id', grandchildId);
    if (childId) await supabaseServer.from('scopes').delete().eq('id', childId);
    if (activeLeafId) await supabaseServer.from('scopes').delete().eq('id', activeLeafId);
    if (inactiveBridgeId) await supabaseServer.from('scopes').delete().eq('id', inactiveBridgeId);
    for (const config of originalContactConfigs) {
      await supabaseServer
        .from('bot_config')
        .update({ config_value: config.config_value })
        .eq('config_key', config.config_key);
    }
    for (const agent of rootAgentStates) {
      await supabaseServer
        .from('agent_config')
        .update({ is_active: agent.is_active })
        .eq('id', agent.id);
    }
    scopeRepository.invalidateCache();
  }
}

main().catch(error => {
  console.error('Scope tree integration failed:', error);
  process.exit(1);
});
