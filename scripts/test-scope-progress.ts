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
  const { ROOT_SCOPE_ID, scopeRepository } = await import('../src/data/repositories/scope.repository');
  const { userRepository } = await import('../src/data/repositories/user.repository');
  const { appointmentRepository } = await import('../src/data/repositories/appointment.repository');
  const { intentConfigRepository } = await import('../src/data/repositories/intent-config.repository');
  const { leadScorer } = await import('../src/core/scoring');
  const { shouldOfferAppointment } = await import('../src/core/appointment/appointment-offer-policy');

  const suffix = Date.now().toString(36);
  const createdScopeIds: string[] = [];
  let singleScopeUserId: string | null = null;
  let userId: string | null = null;
  let comparisonUserId: string | null = null;
  let legacyUserId: string | null = null;
  let endToEndUserId: string | null = null;
  let strongIntentId: string | null = null;
  const endToEndIntentIds: string[] = [];
  let previousRuntimeConfig: Record<string, string> | null = null;

  try {
    const singleScopeUser = await userRepository.findOrCreateByPhone(
      `+5299${Date.now().toString().slice(-8)}`,
      'Single Scope Progress Test'
    );
    singleScopeUserId = singleScopeUser.id;
    await userRepository.markCheckpointCompleted(singleScopeUser.id, ROOT_SCOPE_ID, 'precio');
    await leadScorer.afterCheckpointCompleted(singleScopeUser.id, ROOT_SCOPE_ID);
    const singleScopeResult = await userRepository.findById(singleScopeUser.id);
    assert(singleScopeResult?.lead_score === 15 && singleScopeResult.lead_status === 'cold',
      'Single-scope score differs from the recorded baseline');

    const alpha = await scopeRepository.create({
      name: `Progress Alpha ${suffix}`,
      slug: `progress-alpha-${suffix}`,
      parent_id: ROOT_SCOPE_ID,
    });
    createdScopeIds.push(alpha.id);

    const beta = await scopeRepository.create({
      name: `Progress Beta ${suffix}`,
      slug: `progress-beta-${suffix}`,
      parent_id: ROOT_SCOPE_ID,
    });
    createdScopeIds.push(beta.id);

    const nested = await scopeRepository.create({
      name: `Progress Nested ${suffix}`,
      slug: `progress-nested-${suffix}`,
      parent_id: alpha.id,
      scope_type: 'model',
    });
    createdScopeIds.push(nested.id);

    const user = await userRepository.findOrCreateByPhone(
      `+5298${Date.now().toString().slice(-8)}`,
      'Scope Progress Test'
    );
    userId = user.id;

    await userRepository.markCheckpointCompleted(user.id, alpha.id, 'precio');
    await userRepository.markCheckpointCompleted(user.id, alpha.id, 'precio');
    await userRepository.markCheckpointCompleted(user.id, beta.id, 'precio');
    await userRepository.markCheckpointCompleted(user.id, nested.id, 'ubicacion');

    assert(await userRepository.countCompletedCheckpoints(user.id, alpha.id) === 2,
      'A repeated checkpoint or a different branch contaminated Alpha');
    assert(await userRepository.countCompletedCheckpoints(user.id, beta.id) === 1,
      'The same intent in Beta was not tracked independently');
    assert(await userRepository.countCompletedCheckpoints(user.id, nested.id) === 1,
      'The nested checkpoint was not stored in its exact scope');

    const comparisonUser = await userRepository.findOrCreateByPhone(
      `+5297${Date.now().toString().slice(-8)}`,
      'Scope Comparison Test'
    );
    comparisonUserId = comparisonUser.id;
    await userRepository.markCheckpointCompleted(comparisonUser.id, alpha.id, 'precio');
    await userRepository.markCheckpointCompleted(comparisonUser.id, alpha.id, 'ubicacion');
    await userRepository.markCheckpointCompleted(comparisonUser.id, beta.id, 'modelo');
    await userRepository.markCheckpointCompleted(comparisonUser.id, beta.id, 'creditos');

    const comparisonAlphaCount = await userRepository.countCompletedCheckpoints(comparisonUser.id, alpha.id);
    const comparisonBetaCount = await userRepository.countCompletedCheckpoints(comparisonUser.id, beta.id);
    assert(comparisonAlphaCount === 2 && comparisonBetaCount === 2,
      'Comparison checkpoints were summed across branches');
    assert(!shouldOfferAppointment({
      autoOfferEnabled: true,
      completedCheckpoints: comparisonAlphaCount,
      requiredCheckpoints: 4,
      isStrongSignal: false,
      alreadyOfferedInScope: false,
      isCoolingDown: false,
    }), 'Distributed interest triggered an appointment offer');

    await userRepository.markCheckpointCompleted(user.id, alpha.id, 'modelo');
    await leadScorer.afterCheckpointCompleted(user.id, alpha.id);
    await userRepository.markCheckpointCompleted(user.id, nested.id, 'creditos');
    await leadScorer.afterCheckpointCompleted(user.id, nested.id);

    const alphaBreakdown = await leadScorer.getScoreBreakdown(user.id, alpha.id);
    const betaBreakdown = await leadScorer.getScoreBreakdown(user.id, beta.id);
    const scoredUser = await userRepository.findById(user.id);
    assert(alphaBreakdown.checkpointsCompleted === 4 && alphaBreakdown.totalScore === 60,
      'Alpha did not aggregate checkpoints from its descendant');
    assert(betaBreakdown.totalScore === 15, 'Beta score was contaminated by Alpha');
    assert(scoredUser?.lead_score === 60 && scoredUser.lead_status === 'warm',
      'The user aggregate is not the maximum branch score');

    const alphaShouldOffer = shouldOfferAppointment({
      autoOfferEnabled: true,
      completedCheckpoints: alphaBreakdown.checkpointsCompleted,
      requiredCheckpoints: 4,
      isStrongSignal: false,
      alreadyOfferedInScope: false,
      isCoolingDown: false,
    });
    assert(alphaShouldOffer, 'Concentrated interest did not reach the offer threshold');
    await userRepository.markAppointmentOffered(user.id, alpha.id);

    assert(await userRepository.hasAppointmentBeenOffered(user.id, alpha.id),
      'Alpha offer was not recorded');
    assert(!await userRepository.hasAppointmentBeenOffered(user.id, beta.id),
      'Alpha offer blocked Beta before Beta was offered');
    assert(!shouldOfferAppointment({
      autoOfferEnabled: true,
      completedCheckpoints: 4,
      requiredCheckpoints: 4,
      isStrongSignal: false,
      alreadyOfferedInScope: true,
      isCoolingDown: false,
    }), 'The same scope would repeat its appointment offer');

    strongIntentId = (await intentConfigRepository.create({
      scope_id: beta.id,
      intent_name: `buy_now_${suffix}`,
      display_name: 'Compra inmediata de prueba',
      keywords: [`buy${suffix}`, `ready${suffix}`, `now${suffix}`],
      synonyms: [],
      typos: [],
      phrases: [],
      min_confidence: 0.8,
      priority: 100,
      response_template: null,
      response_type: 'text',
      is_active: true,
      is_checkpoint: false,
      is_strong_signal: true,
    })).id;
    const strongIntent = await intentConfigRepository.getById(strongIntentId);
    assert(strongIntent?.is_strong_signal === true, 'Strong signal is not persisted as intent configuration');
    assert(shouldOfferAppointment({
      autoOfferEnabled: true,
      completedCheckpoints: 1,
      requiredCheckpoints: 4,
      isStrongSignal: true,
      alreadyOfferedInScope: false,
      isCoolingDown: false,
    }), 'Strong signal did not bypass the checkpoint threshold');

    const { configRepository } = await import('../src/data/repositories/config.repository');
    previousRuntimeConfig = await configRepository.getMany([
      'typing_indicator_enabled',
      'appointment_auto_offer_enabled',
      'checkpoints_for_appointment',
    ]);
    await configRepository.updateMultiple([
      { key: 'typing_indicator_enabled', value: 'false' },
      { key: 'appointment_auto_offer_enabled', value: 'true' },
      { key: 'checkpoints_for_appointment', value: '4' },
    ]);

    for (const scope of [alpha, beta]) {
      const keywordPrefix = scope.id === alpha.id ? 'alpha' : 'beta';
      for (let index = 1; index <= 4; index++) {
        const intent = await intentConfigRepository.create({
          scope_id: scope.id,
          intent_name: `progress_${index}_${suffix}`,
          display_name: `Progress topic ${index}`,
          keywords: [`${keywordPrefix}${index}${suffix}`],
          synonyms: [],
          typos: [],
          phrases: [],
          min_confidence: 0.8,
          priority: 100,
          response_template: null,
          response_type: 'text',
          is_active: true,
          is_checkpoint: true,
          is_strong_signal: false,
        });
        endToEndIntentIds.push(intent.id);
        const { error: responseError } = await supabaseServer
          .from('bot_responses')
          .insert({
            intent_id: intent.id,
            response_key: 'main',
            message_text: `Información de ${scope.name}, tema ${index}`,
            response_type: 'simple',
            is_active: true,
          });
        if (responseError) throw responseError;
      }
    }

    const { intentDetectionService } = await import('../src/core/intent-engine/intent-detection.service');
    const { messageProcessor } = await import('../src/core/conversation/message-processor');
    intentDetectionService.invalidateAll();

    await messageProcessor.processMessage(
      comparisonUser.phone_number,
      `buy${suffix}`,
      `progress-strong-${suffix}`,
      'Scope Comparison Test',
      { scopeId: beta.id }
    );
    assert(await userRepository.hasAppointmentBeenOffered(comparisonUser.id, beta.id),
      'The runtime did not offer an appointment for a configured strong signal');

    const endToEndPhone = `+5296${Date.now().toString().slice(-8)}`;

    for (let index = 1; index <= 4; index++) {
      await messageProcessor.processMessage(
        endToEndPhone,
        `alpha${index}${suffix}`,
        `progress-alpha-${index}-${suffix}`,
        'Scope End To End',
        { scopeId: alpha.id }
      );
    }
    const endToEndUser = await userRepository.findByPhone(endToEndPhone);
    assert(endToEndUser, 'End-to-end lead was not created');
    endToEndUserId = endToEndUser.id;
    assert(await userRepository.hasAppointmentBeenOffered(endToEndUser.id, alpha.id),
      'The runtime did not offer an appointment after four Alpha checkpoints');

    await messageProcessor.processMessage(
      endToEndPhone,
      `información beta1${suffix}, tengo otra pregunta?`,
      `progress-beta-1-${suffix}`,
      'Scope End To End',
      { scopeId: beta.id }
    );
    for (let index = 2; index <= 4; index++) {
      await messageProcessor.processMessage(
        endToEndPhone,
        `beta${index}${suffix}`,
        `progress-beta-${index}-${suffix}`,
        'Scope End To End',
        { scopeId: beta.id }
      );
    }
    assert(await userRepository.hasAppointmentBeenOffered(endToEndUser.id, beta.id),
      'The runtime did not offer an appointment in the second development');
    assert((await userRepository.getProgress(endToEndUser.id))?.appointment_offer_count === 2,
      'The end-to-end runtime did not count both offers globally per person');

    await userRepository.markAppointmentOffered(user.id, beta.id);
    const personProgress = await userRepository.getProgress(user.id);
    assert(personProgress?.appointment_offer_count === 2,
      'Appointment initiative was not counted globally per person');

    await userRepository.markAppointmentOfferRejected(user.id);
    assert(await userRepository.isAppointmentOfferCoolingDown(user.id, 168),
      'Offer rejection did not start a person-level cooldown');
    assert(!shouldOfferAppointment({
      autoOfferEnabled: true,
      completedCheckpoints: 0,
      requiredCheckpoints: 4,
      isStrongSignal: true,
      alreadyOfferedInScope: false,
      isCoolingDown: true,
    }), 'Strong signal ignored the person-level cooldown');

    const appointment = await appointmentRepository.create({
      user_id: user.id,
      visitor_name: 'Scope Progress Test',
      requested_date: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
      time_slot: 'morning',
    }, nested.id);
    assert(appointment.scope_id === nested.id, 'Appointment lost its exact origin scope');
    assert((await appointmentRepository.getByScopeId(nested.id)).some(row => row.id === appointment.id),
      'Appointment cannot be queried by its origin scope');

    await leadScorer.afterAppointmentCreated(user.id, nested.id);
    const userWithAppointment = await userRepository.findById(user.id);
    assert(userWithAppointment?.lead_score === 80 && userWithAppointment.lead_status === 'hot',
      'Appointment score did not roll up to Alpha and the user aggregate');

    const { data: duplicatedInvitations, error: invitationError } = await supabaseServer
      .from('bot_responses')
      .select('id, intent_name, response_key, message_text')
      .eq('is_active', true)
      .neq('intent_name', 'cita');
    if (invitationError) throw invitationError;
    const appointmentInvitations = (duplicatedInvitations || []).filter(response => {
      const text = typeof response.message_text === 'string'
        ? response.message_text
        : JSON.stringify(response.message_text);
      return /(te gustaría|puedo|podemos).*(agend|programar).*(cita|visita|llamada)/i.test(text);
    });
    assert(appointmentInvitations.length === 0,
      'A content response still invites the lead to schedule independently');

    // Un lead calificado antes de que existieran los alcances tiene todo su
    // progreso en la raiz. Dar de alta el segundo desarrollo no puede
    // apagarlo: es justo la persona a la que el equipo quiere llamar.
    const legacyUser = await userRepository.findOrCreateByPhone(
      `+5297${Date.now().toString().slice(-8)}`,
      'Legacy Lead'
    );
    legacyUserId = legacyUser.id;
    for (const topic of ['precio', 'ubicacion', 'modelo', 'creditos']) {
      await userRepository.markCheckpointCompleted(legacyUser.id, ROOT_SCOPE_ID, topic);
    }
    await leadScorer.afterCheckpointCompleted(legacyUser.id, ROOT_SCOPE_ID);
    const legacyBefore = await userRepository.findById(legacyUser.id);
    assert(legacyBefore?.lead_score === 60 && legacyBefore.lead_status === 'warm',
      'A lead qualified before scopes must score from its root progress');

    const freshBranch = await scopeRepository.create({
      name: `Progress Fresh ${suffix}`,
      slug: `progress-fresh-${suffix}`,
      parent_id: ROOT_SCOPE_ID,
    });
    createdScopeIds.push(freshBranch.id);
    scopeRepository.invalidateCache();

    await leadScorer.afterScopeInteraction(legacyUser.id, ROOT_SCOPE_ID);
    const legacyAfter = await userRepository.findById(legacyUser.id);
    assert(legacyAfter?.lead_score === 60 && legacyAfter.lead_status === 'warm',
      'Registering a new development must not erase the history of existing leads');

    // La raiz puntua solo lo suyo: dos ramas comparadas no se suman a traves
    // de ella, que es el defecto que este cambio existe para eliminar.
    const rootBreakdown = await leadScorer.getScoreBreakdown(comparisonUserId!, ROOT_SCOPE_ID);
    assert(rootBreakdown.checkpointsCompleted === 0,
      'The root must not accumulate the checkpoints of every branch');

    // Un desarrollo agotado se desactiva; sus leads calificados siguen siendo
    // leads calificados.
    const { error: deactivateError } = await supabaseServer
      .from('scopes')
      .update({ is_active: false })
      .eq('id', alpha.id);
    if (deactivateError) throw deactivateError;
    scopeRepository.invalidateCache();

    await leadScorer.afterScopeInteraction(user.id, alpha.id);
    const afterDeactivation = await userRepository.findById(user.id);
    assert((afterDeactivation?.lead_score ?? 0) >= 80,
      'Deactivating a development must not zero the leads it qualified');

    const { error: reactivateError } = await supabaseServer
      .from('scopes')
      .update({ is_active: true })
      .eq('id', alpha.id);
    if (reactivateError) throw reactivateError;
    scopeRepository.invalidateCache();

    console.log('Scope progress verification passed');
  } finally {
    if (previousRuntimeConfig) {
      const { configRepository } = await import('../src/data/repositories/config.repository');
      await configRepository.updateMultiple(
        Object.entries(previousRuntimeConfig).map(([key, value]) => ({ key, value }))
      );
    }
    if (endToEndIntentIds.length > 0) {
      await supabaseServer.from('intent_configurations').delete().in('id', endToEndIntentIds);
    }
    if (strongIntentId) {
      await supabaseServer.from('intent_configurations').delete().eq('id', strongIntentId);
    }
    for (const id of [legacyUserId, endToEndUserId, comparisonUserId, userId, singleScopeUserId]) {
      if (id) await supabaseServer.from('users').delete().eq('id', id);
    }
    for (const id of createdScopeIds.reverse()) {
      await supabaseServer.from('scopes').delete().eq('id', id);
    }
    scopeRepository.invalidateCache();
  }
}

main().catch(error => {
  console.error('Scope progress verification failed:', error);
  process.exit(1);
});
