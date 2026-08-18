import { createHash, randomUUID } from 'node:crypto';
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
  const { documentCompilerRepository } = await import('../src/data/repositories/document-compiler.repository');
  const { ROOT_SCOPE_ID } = await import('../src/data/repositories/scope.repository');

  const suffix = randomUUID().slice(0, 8);
  const email = `material-replacement-${suffix}@example.com`;
  const password = `Local-${randomUUID()}-A1`;
  const scopeIds: string[] = [];
  const intentIds: string[] = [];
  const materialIds: string[] = [];
  const runIds: string[] = [];
  let adminId: string | null = null;
  let leadId: string | null = null;

  const createScope = async (parentId: string, name: string, active = true, metadata = {}) => {
    const { data, error } = await supabaseServer.from('scopes').insert({
      parent_id: parentId,
      name,
      slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomUUID().slice(0, 8)}`,
      scope_type: parentId === ROOT_SCOPE_ID ? 'development' : 'model',
      is_active: active,
      metadata,
    }).select('id').single();
    if (error) throw error;
    scopeIds.push(data.id);
    return data.id as string;
  };

  const createIntentWithResponse = async (scopeId: string, name: string, edited = false) => {
    const { data: intent, error: intentError } = await supabaseServer.from('intent_configurations').insert({
      scope_id: scopeId,
      intent_name: name,
      display_name: name,
      keywords: [name],
      is_active: true,
    }).select('id').single();
    if (intentError) throw intentError;
    intentIds.push(intent.id);
    const { data: response, error: responseError } = await supabaseServer.from('bot_responses').insert({
      intent_id: intent.id,
      intent_name: name,
      response_key: 'main',
      message_text: `Contenido anterior ${name}`,
      response_type: 'simple',
      is_active: true,
      edited_by_human: edited,
    }).select('id').single();
    if (responseError) throw responseError;
    return { intentId: intent.id as string, responseId: response.id as string };
  };

  const createRunWithProposal = async (input: {
    scopeId: string;
    proposalScopeId: string;
    mode: 'replace' | 'add';
    intentName: string;
  }) => {
    const text = `Material ${input.intentName}`;
    const { data: material, error: materialError } = await supabaseServer.from('compiler_materials').insert({
      scope_id: input.scopeId,
      material_kind: 'text',
      original_filename: `${input.intentName}.txt`,
      mime_type: 'text/plain',
      plain_text: text,
      reading_status: 'ready',
      checksum: createHash('sha256').update(text).digest('hex'),
      created_by: adminId,
    }).select('id').single();
    if (materialError) throw materialError;
    materialIds.push(material.id);

    const { data: run, error: runError } = await supabaseServer.from('compiler_runs').insert({
      scope_id: input.scopeId,
      material_ids: [material.id],
      replacement_mode: input.mode,
      current_stage: 'review',
      status: 'waiting_content_approval',
      tree_approved_at: new Date().toISOString(),
      tree_approved_by: adminId,
      created_by: adminId,
    }).select('id').single();
    if (runError) throw runError;
    runIds.push(run.id);
    await supabaseServer.from('compiler_materials').update({ run_id: run.id }).eq('id', material.id);

    const { data: fact, error: factError } = await supabaseServer.from('compiler_facts').insert({
      run_id: run.id,
      material_id: material.id,
      scope_id: input.proposalScopeId,
      fact_key: 'precio',
      fact_value: '$1,000,000',
      fact_type: 'money',
      page_number: 1,
      fingerprint: createHash('sha256').update(`${run.id}:precio`).digest('hex'),
    }).select('id').single();
    if (factError) throw factError;

    const { data: coverage, error: coverageError } = await supabaseServer.from('compiler_coverage').insert({
      run_id: run.id,
      scope_id: input.proposalScopeId,
      intent_name: input.intentName,
      question: '¿Cuánto cuesta?',
      status: 'covered',
      fact_ids: [fact.id],
      source: 'material',
    }).select('id').single();
    if (coverageError) throw coverageError;

    const [proposal] = await documentCompilerRepository.replaceProposals(run.id, [{
      coverageId: coverage.id,
      scopeId: input.proposalScopeId,
      intentId: null,
      intentName: input.intentName,
      displayName: 'Precio',
      minConfidence: 0.6,
      priority: 20,
      responseKey: `compiler_${input.intentName}`,
      messageText: { fragments: [{ type: 'text', content: 'Precio nuevo.', delay: 0 }] },
      matcherPatterns: { keywords: ['precio'], synonyms: [], typos: [], phrases: ['cuánto cuesta'] },
      signals: [],
      factIds: [fact.id],
    }]);
    intentIds.push(proposal.intent_id);
    return { runId: run.id as string, proposalId: proposal.id as string };
  };

  try {
    const { data: authData, error: authError } = await supabaseServer.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authError || !authData.user) throw authError || new Error('No se creó el administrador local');
    adminId = authData.user.id;
    const { error: adminError } = await supabaseServer.from('admin_users').insert({
      id: adminId,
      email,
      full_name: 'Material Replacement Test',
      role: 'super_admin',
      is_active: true,
    });
    if (adminError) throw adminError;

    const projectId = await createScope(ROOT_SCOPE_ID, `Proyecto ${suffix}`);
    const retiredModelId = await createScope(projectId, `Modelo viejo ${suffix}`);
    const newModelId = await createScope(projectId, `Modelo nuevo ${suffix}`, false);
    // La pregunta que el material nuevo tambien cubre: su contenido anterior
    // tiene que desaparecer aunque lo haya escrito una persona.
    const oldAtProject = await createIntentWithResponse(projectId, `precio_nuevo_${suffix}`, true);
    const oldAtModel = await createIntentWithResponse(retiredModelId, `precio_nuevo_${suffix}`);
    // Preguntas de las que el material no habla. `saludo` y `cita` las nombra
    // el runtime por su nombre y ningun preset las produce: si la sustitucion
    // se las llevara, el bot dejaria de saludar y de poder agendar para
    // siempre. `despedida` no esta cableada y se pierde igual de callada.
    const greeting = await createIntentWithResponse(projectId, 'saludo');
    const appointment = await createIntentWithResponse(projectId, 'cita');
    const farewell = await createIntentWithResponse(projectId, 'despedida');
    const { count: configCountBefore } = await supabaseServer.from('bot_config')
      .select('id', { count: 'exact', head: true });
    const { data: lead, error: leadError } = await supabaseServer.from('users').insert({
      phone_number: `replacement-${suffix}`,
      name: 'Lead Replacement',
    }).select('id').single();
    if (leadError) throw leadError;
    leadId = lead.id;
    const now = new Date().toISOString();
    const { error: sessionError } = await supabaseServer.from('user_sessions').insert({
      user_id: lead.id,
      current_scope_id: retiredModelId,
      scope_focus_updated_at: now,
    });
    if (sessionError) throw sessionError;
    const { error: progressError } = await supabaseServer.from('user_progress').insert({
      user_id: lead.id,
    });
    if (progressError) throw progressError;
    const { error: scopedProgressError } = await supabaseServer.from('user_scope_progress').insert({
      user_id: lead.id,
      scope_id: retiredModelId,
      lead_score: 10,
      lead_status: 'warm',
    });
    if (scopedProgressError) throw scopedProgressError;
    const { error: conversationError } = await supabaseServer.from('conversations').insert({
      user_id: lead.id,
      direction: 'inbound',
      message_text: 'Quiero información',
      scope_id: retiredModelId,
    });
    if (conversationError) throw conversationError;
    const { error: appointmentError } = await supabaseServer.from('appointments').insert({
      user_id: lead.id,
      appointment_date: '2030-01-15',
      time_slot: 'morning',
      time_slot_start: '09:00',
      time_slot_end: '10:00',
      scope_id: retiredModelId,
    });
    if (appointmentError) throw appointmentError;
    const replacement = await createRunWithProposal({
      scopeId: projectId,
      proposalScopeId: newModelId,
      mode: 'replace',
      intentName: `precio_nuevo_${suffix}`,
    });
    const blockedPrevious = await createIntentWithResponse(projectId, `pregunta_bloqueada_${suffix}`);
    const { data: blockedProposal, error: blockedProposalError } = await supabaseServer
      .from('compiler_proposals')
      .insert({
        run_id: replacement.runId,
        scope_id: projectId,
        intent_id: blockedPrevious.intentId,
        response_key: `compiler_bloqueada_${suffix}`,
        message_text: { fragments: [{ type: 'text', content: 'No debe publicarse.', delay: 0 }] },
        matcher_patterns: { keywords: [], synonyms: [], typos: [], phrases: [] },
        review_signals: ['poor_vocabulary'],
        is_publishable: false,
        review_details: { vocabulary: { question: '¿Pregunta bloqueada?', reached: [], missed: ['¿Pregunta bloqueada?'] } },
      })
      .select('id')
      .single();
    if (blockedProposalError) throw blockedProposalError;

    // Un modelo que la corrida propuso y al que no le toco ninguna propuesta.
    // Antes nacia y moria en la misma publicacion.
    const emptyModelId = await createScope(projectId, `Modelo sin contenido ${suffix}`, false);
    await supabaseServer.from('scopes').update({
      metadata: { compiler_run_id: replacement.runId, compiler_aliases: [] },
    }).eq('id', emptyModelId);

    await supabaseServer.from('scopes').update({
      metadata: {
        compiler_run_id: replacement.runId,
        compiler_aliases: ['x'.repeat(170)],
      },
    }).eq('id', newModelId);

    const { error: failedPublish } = await supabaseServer.rpc('publish_compiler_run', {
      run_uuid: replacement.runId,
      admin_uuid: adminId,
    });
    assert(Boolean(failedPublish), 'un fallo a media publicación revierte la transacción');
    const { data: preservedOld } = await supabaseServer.from('bot_responses')
      .select('is_active').eq('id', oldAtProject.responseId).single();
    assert(preservedOld?.is_active, 'el fallo conserva activo todo el contenido anterior');

    await supabaseServer.from('scopes').update({
      metadata: {
        compiler_run_id: replacement.runId,
        compiler_aliases: [`Nuevo ${suffix}`],
      },
    }).eq('id', newModelId);
    const { data: versionBefore } = await supabaseServer.from('scope_tree_version')
      .select('version').eq('singleton', true).single();
    const publicationResult = await documentCompilerRepository.publishRun(replacement.runId, adminId);
    const { data: versionAfter } = await supabaseServer.from('scope_tree_version')
      .select('version').eq('singleton', true).single();
    assert(
      Number(versionAfter?.version) === Number(versionBefore?.version) + 1,
      'publicar incrementa una sola vez la versión del contenido'
    );
    assert(
      publicationResult.published_responses === 1 && publicationResult.blocked_responses === 1,
      'la publicación distingue respuestas publicadas de bloqueadas'
    );
    const [{ data: preservedBlocked }, { data: rejectedBlocked }] = await Promise.all([
      supabaseServer.from('bot_responses').select('is_active').eq('id', blockedPrevious.responseId).single(),
      supabaseServer.from('compiler_proposals').select('approval_status').eq('id', blockedProposal.id).single(),
    ]);
    assert(
      preservedBlocked?.is_active && rejectedBlocked?.approval_status === 'rejected',
      'una propuesta bloqueada queda fuera y conserva la respuesta anterior'
    );

    const { data: oldResponses } = await supabaseServer.from('bot_responses')
      .select('id, is_active, inactive_reason').in('id', [oldAtProject.responseId, oldAtModel.responseId]);
    assert(oldResponses?.every(row => !row.is_active && row.inactive_reason === 'material_replacement'), 'sustituir retira todo el contenido anterior, incluso el editado a mano');
    const { data: scopesAfterReplace } = await supabaseServer.from('scopes')
      .select('id, is_active').in('id', [projectId, retiredModelId, newModelId]);
    const activeById = new Map(scopesAfterReplace?.map(scope => [scope.id, scope.is_active]));
    const { data: retiredAnyway } = await supabaseServer.from('bot_responses')
      .select('is_active')
      .in('id', [greeting.responseId, farewell.responseId]);
    assert(
      retiredAnyway?.every(row => !row.is_active),
      'sustituir no deja viva ninguna respuesta anterior, ni la que el material no menciona'
    );

    // Lo que importa no es que sobreviva una fila, sino que el bot siga
    // sabiendo hacer las dos cosas que ningun material describe.
    const { intentDetectionService } = await import('../src/core/intent-engine/intent-detection.service');
    intentDetectionService.invalidateAll();
    const greetingDetection = await intentDetectionService.detect('hola', supabaseServer, projectId);
    assert(
      greetingDetection.intent?.intent_name === 'saludo',
      'tras sustituir el bot sigue reconociendo un saludo'
    );
    const appointmentDetection = await intentDetectionService.detect(
      'quiero agendar una visita', supabaseServer, projectId
    );
    assert(
      appointmentDetection.intent?.intent_name === 'cita',
      'tras sustituir el bot sigue pudiendo agendar una visita'
    );
    const farewellDetection = await intentDetectionService.detect('gracias', supabaseServer, projectId);
    assert(
      farewellDetection.intent?.intent_name === 'despedida',
      'tras sustituir el bot sigue sabiendo despedirse'
    );
    const { conversationRepository } = await import('../src/data/repositories/conversation.repository');
    const farewellResponses = await conversationRepository.getBotResponses(
      (farewellDetection.intent as any).response_intent_ids || farewellDetection.intent!.intent_id
    );
    assert(
      farewellResponses.length === 1 &&
      !JSON.stringify(farewellResponses[0]).includes('Contenido anterior'),
      'la despedida se repone con su texto base, no con el anterior'
    );

    assert(activeById.get(projectId) === true, 'la raíz de la corrida nunca se retira');
    assert(activeById.get(retiredModelId) === false, 'un alcance ausente del material deja de ofrecerse');
    const { data: emptyModel } = await supabaseServer.from('scopes')
      .select('is_active').eq('id', emptyModelId).single();
    assert(
      emptyModel?.is_active,
      'un alcance que la corrida propuso sobrevive aunque no le tocara contenido'
    );
    assert(activeById.get(newModelId) === true, 'el alcance aprobado se activa al publicar');
    const { count: activePublished } = await supabaseServer.from('bot_responses')
      .select('id', { count: 'exact', head: true })
      .eq('compiler_proposal_id', replacement.proposalId)
      .eq('is_active', true);
    assert(activePublished === 1, 'la corrida publica una sola respuesta nueva por propuesta');
    const [leadResult, sessionResult, progressResult, scopedProgressResult, conversationResult, appointmentResult, configResult] = await Promise.all([
      supabaseServer.from('users').select('id', { count: 'exact', head: true }).eq('id', lead.id),
      supabaseServer.from('user_sessions').select('id', { count: 'exact', head: true }).eq('user_id', lead.id),
      supabaseServer.from('user_progress').select('id', { count: 'exact', head: true }).eq('user_id', lead.id),
      supabaseServer.from('user_scope_progress').select('id', { count: 'exact', head: true }).eq('user_id', lead.id),
      supabaseServer.from('conversations').select('id', { count: 'exact', head: true }).eq('user_id', lead.id),
      supabaseServer.from('appointments').select('id', { count: 'exact', head: true }).eq('user_id', lead.id),
      supabaseServer.from('bot_config').select('id', { count: 'exact', head: true }),
    ]);
    assert(
      [leadResult, sessionResult, progressResult, scopedProgressResult, conversationResult, appointmentResult]
        .every(result => result.count === 1)
      && configResult.count === configCountBefore,
      'leads, sesiones, progreso, conversaciones, citas y configuración sobreviven'
    );
    const { scopeRoutingService } = await import('../src/core/conversation/scope-routing.service');
    const nextRouting = await scopeRoutingService.resolve({
      userId: lead.id,
      message: 'hola',
    });
    // Con varias ramas activas el foco suelto vuelve a la raiz del negocio; con
    // una sola, a esa. La asercion anterior daba por hecho lo segundo, asi que
    // solo pasaba sobre una base recien reseteada.
    const branchCount = (await supabaseServer.from('scopes')
      .select('id', { count: 'exact', head: true })
      .eq('parent_id', ROOT_SCOPE_ID)
      .eq('is_active', true)).count || 0;
    assert(
      nextRouting.scopeId === (branchCount === 1 ? projectId : ROOT_SCOPE_ID) &&
      nextRouting.scopeId !== retiredModelId,
      'un foco retirado se suelta y deja de responder desde el alcance retirado'
    );

    const addProjectId = await createScope(ROOT_SCOPE_ID, `Proyecto add ${suffix}`);
    const existingAdd = await createIntentWithResponse(addProjectId, `existente_add_${suffix}`);
    const addModelId = await createScope(addProjectId, `Modelo add ${suffix}`, false);
    const addition = await createRunWithProposal({
      scopeId: addProjectId,
      proposalScopeId: addModelId,
      mode: 'add',
      intentName: `precio_add_${suffix}`,
    });
    await documentCompilerRepository.publishRun(addition.runId, adminId);
    const { data: preservedAdd } = await supabaseServer.from('bot_responses')
      .select('is_active').eq('id', existingAdd.responseId).single();
    assert(preservedAdd?.is_active, 'el modo añadir conserva el contenido existente');

  } finally {
    if (leadId) await supabaseServer.from('users').delete().eq('id', leadId);
    if (runIds.length > 0) await supabaseServer.from('compiler_runs').delete().in('id', runIds);
    if (materialIds.length > 0) await supabaseServer.from('compiler_materials').delete().in('id', materialIds);
    // Por alcance y no por la lista registrada: publicar repone el vocabulario
    // base, y esas intenciones no las creo esta prueba. Sin ellas el borrado
    // del alcance fallaba contra la clave foranea y el fallo se tiraba.
    const { data: scopedIntents } = scopeIds.length > 0
      ? await supabaseServer.from('intent_configurations').select('id').in('scope_id', scopeIds)
      : { data: [] };
    const allIntentIds = Array.from(new Set([
      ...intentIds,
      ...(scopedIntents || []).map(intent => intent.id),
    ]));
    if (allIntentIds.length > 0) {
      const { data: responses } = await supabaseServer.from('bot_responses').select('id').in('intent_id', allIntentIds);
      const responseIds = (responses || []).map(response => response.id);
      if (responseIds.length > 0) {
        await supabaseServer.from('response_replacements').delete()
          .or(`previous_response_id.in.(${responseIds.join(',')}),replacement_response_id.in.(${responseIds.join(',')})`);
        await supabaseServer.from('bot_responses').delete().in('id', responseIds);
      }
      await supabaseServer.from('intent_configurations').delete().in('id', allIntentIds);
    }
    // El error del borrado se comprueba: una fuga que no se ve es una fuga que
    // se queda.
    const leaked: string[] = [];
    for (const scopeId of scopeIds.reverse()) {
      const { error } = await supabaseServer.from('scopes').delete().eq('id', scopeId);
      if (error) leaked.push(`${scopeId}: ${error.message}`);
    }
    if (leaked.length > 0) {
      throw new Error(`La prueba dejó alcances sin borrar:\n  ${leaked.join('\n  ')}`);
    }
    if (adminId) {
      await supabaseServer.from('admin_users').delete().eq('id', adminId);
      await supabaseServer.auth.admin.deleteUser(adminId);
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
