import { randomUUID, createHash } from 'node:crypto';
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
  const { ScopeRepository, ROOT_SCOPE_ID } = await import('../src/data/repositories/scope.repository');
  const { intentDetectionService } = await import('../src/core/intent-engine/intent-detection.service');

  const suffix = randomUUID().slice(0, 8);
  const scopeIds: string[] = [];
  const intentIds: string[] = [];
  const responseIds: string[] = [];
  let runId: string | null = null;
  let materialId: string | null = null;

  try {
    const insertScope = async (parentId: string, name: string) => {
      const { data, error } = await supabaseServer.from('scopes').insert({
        parent_id: parentId,
        name,
        slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${suffix}`,
        scope_type: parentId === ROOT_SCOPE_ID ? 'proyecto' : 'opcion',
      }).select('id').single();
      if (error) throw error;
      scopeIds.push(data.id);
      return data.id as string;
    };

    const projectId = await insertScope(ROOT_SCOPE_ID, 'Scoped Project');
    const modelAId = await insertScope(projectId, 'Scoped Model A');
    const modelBId = await insertScope(projectId, 'Scoped Model B');

    const text = `Contenido por alcance ${suffix}`;
    const { data: material, error: materialError } = await supabaseServer
      .from('compiler_materials')
      .insert({
        scope_id: projectId,
        material_kind: 'text',
        original_filename: `scoped-${suffix}.txt`,
        mime_type: 'text/plain',
        plain_text: text,
        reading_status: 'ready',
        checksum: createHash('sha256').update(text).digest('hex'),
      })
      .select('id')
      .single();
    if (materialError) throw materialError;
    materialId = material.id;

    const { data: run, error: runError } = await supabaseServer
      .from('compiler_runs')
      .insert({
        scope_id: projectId,
        material_ids: [material.id],
        current_stage: 'review',
        status: 'waiting_content_approval',
        tree_approved_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (runError) throw runError;
    runId = run.id;

    const { data: fact, error: factError } = await supabaseServer
      .from('compiler_facts')
      .insert({
        run_id: run.id,
        material_id: material.id,
        scope_id: modelAId,
        fact_key: 'amenidad',
        fact_value: 'Casa club',
        fact_type: 'text',
        page_number: 1,
        fingerprint: createHash('sha256').update(`amenidad:${suffix}`).digest('hex'),
      })
      .select('id')
      .single();
    if (factError) throw factError;

    const intentName = `amenidades_${suffix}`;
    const { data: coverage, error: coverageError } = await supabaseServer
      .from('compiler_coverage')
      .insert({
        run_id: run.id,
        scope_id: projectId,
        intent_name: intentName,
        question: '¿Qué amenidades tiene?',
        status: 'covered',
        fact_ids: [fact.id],
        source: 'material',
      })
      .select('id')
      .single();
    if (coverageError) throw coverageError;

    const [proposal] = await documentCompilerRepository.replaceProposals(run.id, [{
      coverageId: coverage.id,
      scopeId: modelAId,
      intentId: null,
      intentName,
      displayName: 'Amenidades',
      minConfidence: 0.6,
      priority: 20,
      responseKey: `compiler_${intentName}`,
      messageText: { fragments: [{ type: 'text', content: 'Incluye casa club.', delay: 0 }] },
      matcherPatterns: {
        keywords: ['amenidades'],
        synonyms: ['servicios'],
        typos: [],
        phrases: ['qué amenidades tiene'],
      },
      signals: [],
      factIds: [fact.id],
    }]);
    assert(Boolean(proposal), 'crea la propuesta en el alcance destino');

    const { data: createdIntent, error: createdIntentError } = await supabaseServer
      .from('intent_configurations')
      .select('id, scope_id, is_active')
      .eq('scope_id', modelAId)
      .eq('intent_name', intentName)
      .single();
    if (createdIntentError) throw createdIntentError;
    intentIds.push(createdIntent.id);
    assert(createdIntent.scope_id === modelAId, 'crea la intención que falta en el modelo, no en la raíz');
    assert(!createdIntent.is_active, 'la intención que nadie ha aprobado nace apagada');

    // Generar contenido es automatico. Si la intencion naciera encendida, el
    // lead que hace justo esa pregunta seria entendido por el matcher y
    // recibiria una cortesia vacia, porque todavia no hay respuesta publicada.
    const beforeApproval = await intentDetectionService.detect(
      '¿Qué amenidades tiene?',
      supabaseServer,
      modelAId
    );
    assert(
      beforeApproval.intent?.intent_name !== intentName,
      'el vocabulario propuesto no llega al matcher antes de aprobarse'
    );

    const badIntentName = `atomic_${suffix}`;
    let atomicFailureObserved = false;
    try {
      await documentCompilerRepository.replaceProposals(run.id, [
        {
          coverageId: coverage.id,
          scopeId: modelBId,
          intentId: null,
          intentName: badIntentName,
          displayName: 'Atomicidad',
          minConfidence: 0.6,
          priority: 1,
          responseKey: 'compiler_atomic',
          messageText: { fragments: [{ type: 'text', content: 'Temporal', delay: 0 }] },
          matcherPatterns: { keywords: ['atomicidad'], synonyms: [], typos: [], phrases: [] },
          signals: [],
          factIds: [randomUUID()],
        },
      ]);
    } catch {
      atomicFailureObserved = true;
    }
    assert(atomicFailureObserved, 'un fallo a media escritura aborta el intento');
    const { count: orphanIntentCount } = await supabaseServer
      .from('intent_configurations')
      .select('id', { count: 'exact', head: true })
      .eq('scope_id', modelBId)
      .eq('intent_name', badIntentName);
    assert(orphanIntentCount === 0, 'la transacción no deja intenciones huérfanas');
    const { count: preservedProposalCount } = await supabaseServer
      .from('compiler_proposals')
      .select('id', { count: 'exact', head: true })
      .eq('id', proposal.id);
    assert(preservedProposalCount === 1, 'la transacción fallida conserva la revisión anterior');

    const { data: oldResponse, error: oldResponseError } = await supabaseServer
      .from('bot_responses')
      .insert({
        intent_id: createdIntent.id,
        intent_name: intentName,
        response_key: 'main',
        message_text: 'Texto redactado por una persona.',
        response_type: 'simple',
        is_active: true,
        edited_by_human: true,
      })
      .select('id')
      .single();
    if (oldResponseError) throw oldResponseError;
    responseIds.push(oldResponse.id);

    const { data: siblingIntent, error: siblingIntentError } = await supabaseServer
      .from('intent_configurations')
      .insert({
        scope_id: modelBId,
        intent_name: intentName,
        display_name: 'Amenidades',
        keywords: ['amenidades'],
        is_active: true,
      })
      .select('id')
      .single();
    if (siblingIntentError) throw siblingIntentError;
    intentIds.push(siblingIntent.id);
    const { data: siblingResponse, error: siblingResponseError } = await supabaseServer
      .from('bot_responses')
      .insert({
        intent_id: siblingIntent.id,
        intent_name: intentName,
        response_key: 'main',
        message_text: 'Respuesta del modelo hermano.',
        response_type: 'simple',
        is_active: true,
      })
      .select('id')
      .single();
    if (siblingResponseError) throw siblingResponseError;
    responseIds.push(siblingResponse.id);

    const { error: confirmationError } = await supabaseServer.rpc('approve_compiler_proposal', {
      proposal_uuid: proposal.id,
      admin_uuid: null,
      approved_message: null,
      confirm_replacement: false,
    });
    assert(
      confirmationError?.message.includes('replacement_confirmation_required'),
      'una respuesta humana no se sustituye sin confirmación explícita'
    );

    const { data: approvedId, error: approvalError } = await supabaseServer.rpc(
      'approve_compiler_proposal',
      {
        proposal_uuid: proposal.id,
        admin_uuid: null,
        approved_message: null,
        confirm_replacement: true,
      }
    );
    if (approvalError) throw approvalError;
    responseIds.push(approvedId);

    const { data: activeAfterApproval, error: activeAfterApprovalError } = await supabaseServer
      .from('bot_responses')
      .select('id')
      .eq('intent_id', createdIntent.id)
      .eq('is_active', true);
    if (activeAfterApprovalError) throw activeAfterApprovalError;
    assert(activeAfterApproval.length === 1, 'aprobar deja una sola respuesta activa en la pregunta y alcance');

    const { data: intentAfterApproval, error: intentAfterApprovalError } = await supabaseServer
      .from('intent_configurations')
      .select('is_active')
      .eq('id', createdIntent.id)
      .single();
    if (intentAfterApprovalError) throw intentAfterApprovalError;
    assert(intentAfterApproval.is_active, 'aprobar enciende la intención junto con su respuesta');

    const { data: replacement, error: replacementError } = await supabaseServer
      .from('response_replacements')
      .select('previous_response_id, replacement_response_id')
      .eq('previous_response_id', oldResponse.id)
      .single();
    if (replacementError) throw replacementError;
    assert(replacement.replacement_response_id === approvedId, 'la sustitución conserva qué respuesta reemplazó a cuál');
    const { data: siblingAfterReplacement, error: siblingAfterReplacementError } = await supabaseServer
      .from('bot_responses')
      .select('is_active')
      .eq('id', siblingResponse.id)
      .single();
    if (siblingAfterReplacementError) throw siblingAfterReplacementError;
    assert(siblingAfterReplacement.is_active, 'sustituir en un modelo no modifica la respuesta de su hermano');

    const { data: rejectedProposal, error: rejectedProposalError } = await supabaseServer
      .from('compiler_proposals')
      .insert({
        run_id: run.id,
        coverage_id: coverage.id,
        scope_id: modelBId,
        intent_id: siblingIntent.id,
        response_key: `rejected_${suffix}`,
        message_text: { fragments: [{ type: 'text', content: 'No debe publicarse.', delay: 0 }] },
      })
      .select('id')
      .single();
    if (rejectedProposalError) throw rejectedProposalError;
    await documentCompilerRepository.rejectProposal(rejectedProposal.id);
    const { data: siblingAfterRejection, error: siblingAfterRejectionError } = await supabaseServer
      .from('bot_responses')
      .select('is_active')
      .eq('id', siblingResponse.id)
      .single();
    if (siblingAfterRejectionError) throw siblingAfterRejectionError;
    assert(siblingAfterRejection.is_active, 'rechazar una propuesta conserva la respuesta activa');

    const collisionIntentName = `seguimiento_${suffix}`;
    const { data: collisionIntent, error: collisionIntentError } = await supabaseServer
      .from('intent_configurations')
      .insert({
        scope_id: projectId,
        intent_name: collisionIntentName,
        display_name: 'Seguimiento',
        keywords: [collisionIntentName],
        is_active: true,
      })
      .select('id')
      .single();
    if (collisionIntentError) throw collisionIntentError;
    intentIds.push(collisionIntent.id);

    const { data: collisionResponses, error: collisionResponsesError } = await supabaseServer
      .from('bot_responses')
      .insert([
        { intent_id: collisionIntent.id, intent_name: collisionIntentName, response_key: 'main', message_text: 'Mensaje principal literal.', response_type: 'simple', is_active: true, order_priority: 1 },
        { intent_id: collisionIntent.id, intent_name: collisionIntentName, response_key: 'followup', message_text: 'Seguimiento literal.', response_type: 'simple', is_active: true, order_priority: 2 },
      ])
      .select('id');
    if (collisionResponsesError) throw collisionResponsesError;
    responseIds.push(...collisionResponses.map(row => row.id));

    const { data: combinedId, error: combineError } = await supabaseServer.rpc(
      'resolve_response_collision',
      {
        intent_uuid: collisionIntent.id,
        admin_uuid: null,
        strategy: 'combine',
        keep_response_uuid: null,
        combine_response_uuids: collisionResponses.map(row => row.id),
      }
    );
    if (combineError) throw combineError;
    responseIds.push(combinedId);
    const { data: combined, error: combinedError } = await supabaseServer
      .from('bot_responses')
      .select('message_text, is_active')
      .eq('id', combinedId)
      .single();
    if (combinedError) throw combinedError;
    const contents = combined.message_text.fragments.map((fragment: { content: string }) => fragment.content);
    assert(
      combined.is_active && contents.join('|') === 'Mensaje principal literal.|Seguimiento literal.',
      'main y followup se convierten en fragmentos conservando texto y orden'
    );

    const processA = new ScopeRepository();
    const processB = new ScopeRepository();
    await processA.getScopes(supabaseServer);
    const lateScopeId = await insertScope(projectId, 'Scoped Late Model');
    const scopesFromOtherProcess = await processB.getScopes(supabaseServer);
    assert(
      scopesFromOtherProcess.some(scope => scope.id === lateScopeId),
      'la versión global invalida el árbol entre procesos sin esperar al TTL'
    );
    const { error: deactivateError } = await supabaseServer
      .from('scopes')
      .update({ is_active: false })
      .eq('id', lateScopeId);
    if (deactivateError) throw deactivateError;
    const afterDeactivation = await processA.getScopes(supabaseServer);
    assert(
      afterDeactivation.find(scope => scope.id === lateScopeId)?.is_active === false,
      'desactivar un alcance invalida de inmediato el árbol de otra instancia'
    );
  } finally {
    if (responseIds.length > 0) {
      const { error: replacementError } = await supabaseServer
        .from('response_replacements')
        .delete()
        .or(`previous_response_id.in.(${responseIds.join(',')}),replacement_response_id.in.(${responseIds.join(',')})`);
      if (replacementError) throw replacementError;
      const { error } = await supabaseServer.from('bot_responses').delete().in('id', responseIds);
      if (error) throw error;
    }
    if (runId) {
      const { error: proposalError } = await supabaseServer
        .from('compiler_proposals')
        .delete()
        .eq('run_id', runId);
      if (proposalError) throw proposalError;
      const { error } = await supabaseServer.from('compiler_runs').delete().eq('id', runId);
      if (error) throw error;
    }
    if (materialId) {
      const { error } = await supabaseServer.from('compiler_materials').delete().eq('id', materialId);
      if (error) throw error;
    }
    if (intentIds.length > 0) {
      const { error } = await supabaseServer.from('intent_configurations').delete().in('id', intentIds);
      if (error) throw error;
    }
    for (const scopeId of scopeIds.reverse()) {
      const { error } = await supabaseServer.from('scopes').delete().eq('id', scopeId);
      if (error) throw error;
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
