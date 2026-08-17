/**
 * Recorre contenido por alcance con los modelos reales del compilador:
 * material -> hechos atribuidos -> propuestas por modelo -> aprobación -> lead.
 */
import { createHash, randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.development.local') });
config({ path: resolve(process.cwd(), '.env.local') });

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Fallo: ${message}`);
  console.log(`OK: ${message}`);
}

function renderResponses(responses: unknown[]): string[] {
  return responses.flatMap(response => {
    if (typeof response === 'string') return [response];
    const fragments = (response as { fragments?: Array<{ content?: string }> })?.fragments;
    return fragments?.flatMap(fragment => fragment.content ? [fragment.content] : []) || [];
  });
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) {
    throw new Error('Este script solo puede escribir contra Supabase local');
  }

  const { supabaseServer } = await import('../src/services/supabase/server-client');
  const { documentCompilerService } = await import('../src/core/document-compiler/document-compiler.service');
  const { documentCompilerRepository } = await import('../src/data/repositories/document-compiler.repository');
  const { messageProcessor } = await import('../src/core/conversation/message-processor');
  const { intentDetectionService } = await import('../src/core/intent-engine/intent-detection.service');
  const { normalizeScopeAlias } = await import('../src/core/onboarding/client-vocabulary');
  const { ROOT_SCOPE_ID, scopeRepository } = await import('../src/data/repositories/scope.repository');

  const suffix = randomUUID().slice(0, 8);
  const projectName = `Desarrollo Alcance ${suffix}`;
  const models = [
    { name: `Aura ${suffix}`, price: '$1,111,000' },
    { name: `Vento ${suffix}`, price: '$2,222,000' },
    { name: `Solara ${suffix}`, price: '$3,333,000' },
  ];
  const source = [
    `${projectName} se ubica en Avenida Prueba 123, Villahermosa.`,
    `${projectName} tiene alberca semiolímpica y casa club como amenidades.`,
    `${models[0].name} cuesta ${models[0].price} MXN y tiene 3 recámaras.`,
    `${models[1].name} cuesta ${models[1].price} MXN y tiene 3 recámaras.`,
    `${models[2].name} cuesta ${models[2].price} MXN y tiene 4 recámaras.`,
  ].join('\n');

  const scopeIds: string[] = [];
  const phones = models.map((_, index) => `se${suffix}${index}`);
  let materialId: string | null = null;
  let runId: string | null = null;

  try {
    const { data: material, error: materialError } = await supabaseServer
      .from('compiler_materials')
      .insert({
        scope_id: ROOT_SCOPE_ID,
        material_kind: 'text',
        original_filename: `scoped-e2e-${suffix}.txt`,
        mime_type: 'text/plain',
        plain_text: source,
        reading_status: 'ready',
        checksum: createHash('sha256').update(source).digest('hex'),
      })
      .select('id')
      .single();
    if (materialError) throw materialError;
    materialId = material.id;

    const { data: run, error: runError } = await supabaseServer
      .from('compiler_runs')
      .insert({
        scope_id: ROOT_SCOPE_ID,
        material_ids: [material.id],
        status: 'running',
        current_stage: 'extract_facts',
      })
      .select('id')
      .single();
    if (runError) throw runError;
    runId = run.id;

    await documentCompilerService.runNextStage(run.id);
    await documentCompilerService.runNextStage(run.id);

    const { data: project, error: projectError } = await supabaseServer
      .from('scopes')
      .insert({
        parent_id: ROOT_SCOPE_ID,
        name: projectName,
        slug: `scoped-e2e-${suffix}`,
        scope_type: 'proyecto',
      })
      .select('id')
      .single();
    if (projectError) throw projectError;
    scopeIds.push(project.id);

    const modelScopeByName = new Map<string, string>();
    for (const model of models) {
      const { data: scope, error } = await supabaseServer
        .from('scopes')
        .insert({
          parent_id: project.id,
          name: model.name,
          slug: normalizeScopeAlias(model.name).replace(/\s+/g, '-'),
          scope_type: 'opcion',
        })
        .select('id')
        .single();
      if (error) throw error;
      scopeIds.push(scope.id);
      modelScopeByName.set(normalizeScopeAlias(model.name), scope.id);
    }

    const facts = await documentCompilerRepository.getFacts(run.id);
    const factScopeById = new Map<string, string>();
    for (const fact of facts) {
      const subject = normalizeScopeAlias(fact.subject || '');
      const modelScope = Array.from(modelScopeByName.entries()).find(([name]) =>
        subject === name || ` ${subject} `.includes(` ${name} `)
      )?.[1];
      factScopeById.set(fact.id, modelScope || project.id);
    }
    await documentCompilerRepository.assignRunToStructure(run.id, project.id, factScopeById);
    await documentCompilerRepository.approveTree(run.id, null);
    await documentCompilerService.runNextStage(run.id);
    await documentCompilerService.runNextStage(run.id);

    const { data: proposals, error: proposalsError } = await supabaseServer
      .from('compiler_proposals')
      .select('id, scope_id, intent_configurations(intent_name)')
      .eq('run_id', run.id);
    if (proposalsError) throw proposalsError;

    const priceProposals = (proposals || []).filter((proposal: any) =>
      proposal.intent_configurations?.intent_name === 'precio'
    );
    assert(priceProposals.length === 3, 'tres precios del material producen tres propuestas');
    assert(
      priceProposals.every(proposal => Array.from(modelScopeByName.values()).includes(proposal.scope_id)),
      'cada propuesta de precio aterriza en su modelo'
    );
    const locationProposal = (proposals || []).find((proposal: any) =>
      proposal.intent_configurations?.intent_name === 'ubicacion'
    );
    assert(locationProposal?.scope_id === project.id, 'la dirección sin sujeto permanece en el desarrollo');
    const amenitiesProposal = (proposals || []).find((proposal: any) =>
      proposal.intent_configurations?.intent_name === 'amenidades'
    );
    assert(amenitiesProposal?.scope_id === project.id, 'crea la intención de amenidades que faltaba');

    for (const proposal of proposals || []) {
      const { error } = await supabaseServer.rpc('approve_compiler_proposal', {
        proposal_uuid: proposal.id,
        admin_uuid: null,
        approved_message: null,
        confirm_replacement: false,
      });
      if (error) throw error;
    }

    intentDetectionService.invalidateAll();
    for (let index = 0; index < models.length; index += 1) {
      const model = models[index];
      const scopeId = modelScopeByName.get(normalizeScopeAlias(model.name))!;
      const result = await messageProcessor.processMessage(
        phones[index],
        '¿Cuál es el precio?',
        `price-${suffix}-${index}`,
        'Scoped E2E',
        { scopeId, suppressExternalMessages: true }
      );
      const rendered = renderResponses(result.responses);
      assert(!result.isFallback, `${model.name} responde precio sin fallback`);
      assert(rendered.length === 1, `${model.name} devuelve una sola respuesta de precio`);
      assert(
        rendered[0].replace(/\s/g, '').includes(model.price.replace(/\s/g, '')),
        `${model.name} devuelve su propio precio`
      );
    }

    const firstScopeId = modelScopeByName.get(normalizeScopeAlias(models[0].name))!;
    const location = await messageProcessor.processMessage(
      phones[0],
      '¿Dónde se ubica?',
      `location-${suffix}`,
      'Scoped E2E',
      { scopeId: firstScopeId, suppressExternalMessages: true }
    );
    assert(
      renderResponses(location.responses).some(text => text.includes('Avenida Prueba 123')),
      'un modelo hereda la ubicación compilada del desarrollo'
    );
    const amenities = await messageProcessor.processMessage(
      phones[0],
      '¿Qué amenidades tiene?',
      `amenities-${suffix}`,
      'Scoped E2E',
      { scopeId: firstScopeId, suppressExternalMessages: true }
    );
    assert(
      renderResponses(amenities.responses).some(text => /alberca|casa club/i.test(text)),
      'un lead recibe la intención nueva de amenidades una vez aprobada'
    );
  } finally {
    for (const phone of phones) {
      const { error } = await supabaseServer.from('users').delete().eq('phone_number', phone);
      if (error) throw error;
    }

    if (scopeIds.length > 0) {
      const { data: intents, error: intentsError } = await supabaseServer
        .from('intent_configurations')
        .select('id')
        .in('scope_id', scopeIds);
      if (intentsError) throw intentsError;
      const intentIds = (intents || []).map(intent => intent.id);
      if (intentIds.length > 0) {
        const { data: responses, error: responsesError } = await supabaseServer
          .from('bot_responses')
          .select('id')
          .in('intent_id', intentIds);
        if (responsesError) throw responsesError;
        const responseIds = (responses || []).map(response => response.id);
        if (responseIds.length > 0) {
          const { error: replacementsError } = await supabaseServer
            .from('response_replacements')
            .delete()
            .or(`previous_response_id.in.(${responseIds.join(',')}),replacement_response_id.in.(${responseIds.join(',')})`);
          if (replacementsError) throw replacementsError;
          const { error: responsesDeleteError } = await supabaseServer
            .from('bot_responses')
            .delete()
            .in('id', responseIds);
          if (responsesDeleteError) throw responsesDeleteError;
        }
      }
    }
    if (runId) {
      const { error: proposalsDeleteError } = await supabaseServer
        .from('compiler_proposals')
        .delete()
        .eq('run_id', runId);
      if (proposalsDeleteError) throw proposalsDeleteError;
      const { error: runDeleteError } = await supabaseServer.from('compiler_runs').delete().eq('id', runId);
      if (runDeleteError) throw runDeleteError;
    }
    if (materialId) {
      const { error } = await supabaseServer.from('compiler_materials').delete().eq('id', materialId);
      if (error) throw error;
    }
    if (scopeIds.length > 0) {
      const { error: intentDeleteError } = await supabaseServer
        .from('intent_configurations')
        .delete()
        .in('scope_id', scopeIds);
      if (intentDeleteError) throw intentDeleteError;
    }
    for (const scopeId of scopeIds.slice(1).reverse()) {
      const { error } = await supabaseServer.from('scopes').delete().eq('id', scopeId);
      if (error) throw error;
    }
    if (scopeIds[0]) {
      const { error } = await supabaseServer.from('scopes').delete().eq('id', scopeIds[0]);
      if (error) throw error;
    }
    scopeRepository.invalidateCache();
    intentDetectionService.invalidateAll();
  }
}

main()
  .then(() => console.log('Scoped content end-to-end verified'))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
