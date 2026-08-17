import { config } from 'dotenv';
import { createHash, randomUUID } from 'node:crypto';
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
  const { onboardingService } = await import('../src/core/onboarding/onboarding.service');
  const { onboardingRepository } = await import('../src/data/repositories/onboarding.repository');
  const { clientBrandRepository } = await import('../src/data/repositories/client-brand.repository');
  const { scopeRoutingRepository } = await import('../src/data/repositories/scope-routing.repository');
  const { ROOT_SCOPE_ID } = await import('../src/data/repositories/scope.repository');

  const suffix = randomUUID().slice(0, 8);
  const email = `onboarding-${suffix}@example.com`;
  const password = `Local-${randomUUID()}-A1`;
  const originalBrand = await clientBrandRepository.get();
  const { data: originalRoot, error: rootError } = await supabaseServer
    .from('scopes').select('name').eq('id', ROOT_SCOPE_ID).single();
  if (rootError) throw rootError;
  let adminId: string | null = null;
  const scopeIds: string[] = [];
  const runIds: string[] = [];
  const materialIds: string[] = [];
  const leadPhone = `52155${Date.now().toString().slice(-8)}`;

  try {
    const { data: authData, error: authError } = await supabaseServer.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (authError || !authData.user) throw authError || new Error('No se creo el administrador local');
    adminId = authData.user.id;
    const { error: adminError } = await supabaseServer.from('admin_users').insert({
      id: adminId,
      email,
      full_name: 'Onboarding Test',
      role: 'super_admin',
      is_active: true,
    });
    if (adminError) throw adminError;

    const initialState = await onboardingService.getState(adminId);
    const originalGreeting = initialState.currentGreeting;
    let session = initialState.session;
    assert(session.current_step === 1, 'el recorrido inicia pidiendo el material');

    const materialText = `Altavista ${suffix}. Modelos Milano y Verona.`;
    const { data: material, error: materialError } = await supabaseServer
      .from('compiler_materials')
      .insert({
        scope_id: ROOT_SCOPE_ID,
        material_kind: 'text',
        original_filename: 'brochure.txt',
        mime_type: 'text/plain',
        plain_text: materialText,
        reading_status: 'ready',
        checksum: createHash('sha256').update(materialText).digest('hex'),
        created_by: adminId,
      })
      .select('*')
      .single();
    if (materialError) throw materialError;
    materialIds.push(material.id);

    const projectName = `Altavista ${suffix}`;
    const missingPartName = `Verona ${suffix}`;
    const { data: run, error: runError } = await supabaseServer
      .from('compiler_runs')
      .insert({
        scope_id: ROOT_SCOPE_ID,
        material_ids: [material.id],
        current_stage: 'tree',
        status: 'waiting_tree_approval',
        proposed_tree: [
          { name: projectName, scope_type: 'proyecto', parent_name: null },
          { name: `Milano ${suffix}`, scope_type: 'opcion', parent_name: projectName },
          { name: missingPartName, scope_type: 'opcion', parent_name: projectName },
          // Ni la amenidad ni la etapa se venden por separado: no pueden
          // llegar a la pantalla como opciones de venta.
          { name: `Casa club ${suffix}`, scope_type: 'amenidad', parent_name: projectName },
          { name: `Primera etapa ${suffix}`, scope_type: 'etapa', parent_name: projectName },
        ],
        stage_checkpoint: {
          business_name: `Grupo ${suffix}`,
          candidate_questions: [],
        },
        created_by: adminId,
      })
      .select('*')
      .single();
    if (runError) throw runError;
    runIds.push(run.id);
    const { error: linkError } = await supabaseServer
      .from('compiler_materials').update({ run_id: run.id }).eq('id', material.id);
    if (linkError) throw linkError;

    const { data: fact, error: factError } = await supabaseServer
      .from('compiler_facts')
      .insert({
        run_id: run.id,
        material_id: material.id,
        scope_id: ROOT_SCOPE_ID,
        fact_key: 'precio',
        subject: missingPartName,
        fact_value: '$2,100,000',
        fact_type: 'money',
        page_number: 1,
        provenance_confidence: 1,
        fingerprint: `price-${suffix}`,
      })
      .select('*')
      .single();
    if (factError) throw factError;

    session = await onboardingService.attachRun(adminId, run.id);
    assert(session.current_step === 2 && !session.scope_id, 'el material se lee antes de crear proyectos');
    const proposed = (await onboardingService.getState(adminId)).proposedStructure;
    assert(proposed?.partNames.includes(missingPartName), 'una parte no declarada aparece en la propuesta');
    assert(
      !proposed?.partNames.some(name => name.startsWith('Casa club') || name.startsWith('Primera etapa')),
      'una amenidad y una etapa no se ofrecen como opciones de venta'
    );

    session = await onboardingService.confirmProposedStructure(adminId, {
      projectName,
      partNames: proposed!.partNames,
      flatten: false,
    });
    assert(Boolean(session.scope_id), 'confirmar la propuesta crea el proyecto');
    scopeIds.push(session.scope_id!);

    const { data: createdScopes, error: scopesError } = await supabaseServer
      .from('scopes').select('*').eq('parent_id', session.scope_id);
    if (scopesError) throw scopesError;
    scopeIds.push(...(createdScopes || []).map(scope => scope.id));
    const veronaScope = createdScopes?.find(scope => scope.name === missingPartName);
    const { data: reassignedFact, error: reassignedError } = await supabaseServer
      .from('compiler_facts').select('scope_id').eq('id', fact.id).single();
    if (reassignedError) throw reassignedError;
    assert(reassignedFact.scope_id === veronaScope?.id, 'el contenido de una parte se asigna a esa parte');

    const { data: approvedRun, error: approvedError } = await supabaseServer
      .from('compiler_runs').select('scope_id, current_stage, tree_approved_at').eq('id', run.id).single();
    if (approvedError) throw approvedError;
    assert(approvedRun.scope_id === session.scope_id && approvedRun.current_stage === 'catalog' && approvedRun.tree_approved_at,
      'la confirmacion humana abre la preparacion del contenido');

    const aliases = await scopeRoutingRepository.getActiveAliases();
    assert(aliases.some(alias => alias.scope_id === veronaScope?.id && alias.alias === missingPartName),
      'los nombres propuestos quedan disponibles para el ruteo');

    session = await onboardingService.saveVisitFlow(adminId, {
      choice: 'decided',
      partNames: proposed!.partNames,
    });
    session = await onboardingService.saveIdentity(adminId, {
      businessName: `Grupo ${suffix}`,
      singular: 'desarrollo',
      plural: 'desarrollos',
      greetingChoice: 'keep',
    });
    const stateWithIdentity = await onboardingService.getState(adminId);
    assert(stateWithIdentity.currentGreeting === originalGreeting,
      'elegir conservar no modifica el saludo existente');
    assert(stateWithIdentity.brand.use_composed_greeting === false,
      'el saludo compuesto exige confirmacion explicita');

    session = await onboardingService.confirmGoal(adminId);
    assert(session.current_step === 6, 'el avance queda guardado y puede retomarse');
    const resumed = await onboardingRepository.getLatest(adminId);
    assert(resumed?.current_step === 6, 'volver al recorrido continua donde se dejo');

    await onboardingService.saveTone(adminId, 'friendly');
    const { error: readyError } = await supabaseServer
      .from('compiler_runs')
      .update({ current_stage: 'review', status: 'waiting_content_approval' })
      .eq('id', run.id);
    if (readyError) throw readyError;
    session = await onboardingService.advance(adminId);
    assert(session.status === 'completed', 'el recorrido llega a revision con los defaults');

    const { data: firstBefore, error: firstBeforeError } = await supabaseServer
      .from('scopes').select('*').eq('id', scopeIds[0]).single();
    if (firstBeforeError) throw firstBeforeError;

    session = await onboardingService.startNew(adminId);
    session = await onboardingService.chooseManualSetup(adminId);
    session = await onboardingService.saveProject(adminId, {
      name: `Milano ${suffix}`,
      aliases: [],
    });
    scopeIds.push(session.scope_id!);
    session = await onboardingService.saveVisitFlow(adminId, { choice: 'unsure', partNames: [] });
    session = await onboardingService.saveIdentity(adminId, {
      businessName: `Grupo ${suffix}`,
      singular: 'desarrollo',
      plural: 'desarrollos',
      greetingChoice: 'composed',
    });
    session = await onboardingService.confirmGoal(adminId);
    session = await onboardingService.saveTone(adminId, 'friendly');
    assert(session.status === 'completed', 'no tener material y responder no estoy seguro no bloquea el alta');

    const { data: firstAfter, error: firstAfterError } = await supabaseServer
      .from('scopes').select('*').eq('id', scopeIds[0]).single();
    if (firstAfterError) throw firstAfterError;
    assert(JSON.stringify(firstAfter) === JSON.stringify(firstBefore), 'un segundo proyecto no altera el primero');

    const composedState = await onboardingService.getState(adminId);
    assert(composedState.composedGreeting.includes(projectName) && composedState.composedGreeting.includes(`Milano ${suffix}`),
      'el saludo compuesto incorpora proyectos nuevos sin editar un texto');
    const { configRepository } = await import('../src/data/repositories/config.repository');
    const typingWasEnabled = await configRepository.get('typing_indicator_enabled', 'false');
    await configRepository.set('typing_indicator_enabled', 'false');
    const { messageProcessor } = await import('../src/core/conversation/message-processor');
    const { data: greetingIntent, error: greetingIntentError } = await supabaseServer
      .from('intent_configurations')
      .select('id')
      .eq('intent_name', 'saludo')
      .eq('scope_id', ROOT_SCOPE_ID)
      .single();
    if (greetingIntentError) throw greetingIntentError;
    const { data: greetingRows, error: greetingRowsError } = await supabaseServer
      .from('bot_responses')
      .select('id, is_active')
      .eq('intent_id', greetingIntent.id);
    if (greetingRowsError) throw greetingRowsError;
    const { error: disableGreetingError } = await supabaseServer
      .from('bot_responses')
      .update({ is_active: false })
      .eq('intent_id', greetingIntent.id);
    if (disableGreetingError) throw disableGreetingError;
    let greeting;
    try {
      greeting = await messageProcessor.processMessage(
        leadPhone,
        'hola',
        `greeting-${suffix}`,
        'Lead Onboarding'
      );
    } finally {
      for (const row of greetingRows || []) {
        const { error: restoreGreetingError } = await supabaseServer
          .from('bot_responses')
          .update({ is_active: row.is_active })
          .eq('id', row.id);
        if (restoreGreetingError) throw restoreGreetingError;
      }
      await configRepository.set('typing_indicator_enabled', typingWasEnabled);
    }
    const greetingText = greeting.responses.find(response => typeof response === 'string');
    assert(
      typeof greetingText === 'string'
      && greetingText.includes(`Grupo ${suffix}`)
      && greetingText.includes(projectName)
      && greetingText.includes(`Milano ${suffix}`),
      'un cliente sin saludo propio recibe el compuesto con la identidad y los proyectos actuales'
    );

    console.log('Onboarding chat integration verified');
  } finally {
    await supabaseServer.from('users').delete().eq('phone_number', leadPhone);
    if (adminId) await supabaseServer.from('onboarding_sessions').delete().eq('admin_id', adminId);
    if (runIds.length > 0) await supabaseServer.from('compiler_runs').delete().in('id', runIds);
    if (materialIds.length > 0) await supabaseServer.from('compiler_materials').delete().in('id', materialIds);
    for (const scopeId of scopeIds.reverse()) await supabaseServer.from('scopes').delete().eq('id', scopeId);
    await clientBrandRepository.update({
      businessName: originalBrand.business_name || originalRoot.name,
      projectSingular: originalBrand.project_singular,
      projectPlural: originalBrand.project_plural,
      tone: originalBrand.tone,
      configured: originalBrand.is_configured,
      useComposedGreeting: originalBrand.use_composed_greeting,
    });
    await supabaseServer.from('scopes').update({ name: originalRoot.name }).eq('id', ROOT_SCOPE_ID);
    if (adminId) await supabaseServer.auth.admin.deleteUser(adminId);
  }
}

main().catch(error => {
  console.error('Onboarding chat integration failed:', error);
  process.exit(1);
});
