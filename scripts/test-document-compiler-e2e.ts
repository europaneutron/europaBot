/**
 * Recorrido completo del compilador, de un PDF a un lead.
 *
 * Sube material, lo compila con el modelo real, comprueba las dos compuertas y
 * verifica que la respuesta aprobada llega por el matcher, sin que el runtime
 * toque nada del compilador.
 *
 * Consume llamadas a la API. Ejecutar con: npx tsx scripts/test-document-compiler-e2e.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';

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
  const { documentCompilerService } = await import('../src/core/document-compiler/document-compiler.service');
  const { documentCompilerRepository } = await import('../src/data/repositories/document-compiler.repository');
  const { messageProcessor } = await import('../src/core/conversation/message-processor');
  const { intentDetectionService } = await import('../src/core/intent-engine/intent-detection.service');
  const { ROOT_SCOPE_ID } = await import('../src/data/repositories/scope.repository');

  const suffix = randomUUID().slice(0, 8);
  const phone = `e2e${suffix}`;
  let materialId: string | null = null;
  let runId: string | null = null;
  let storagePath: string | null = null;
  let responseId: string | null = null;

  const previousTyping = (await supabaseServer.from('bot_config').select('config_value').eq('config_key', 'typing_indicator_enabled').single()).data?.config_value ?? 'true';
  await supabaseServer.from('bot_config').update({ config_value: 'false' }).eq('config_key', 'typing_indicator_enabled');

  try {
    const bytes = readFileSync(resolve(process.cwd(), 'scripts/fixtures/compiler/brochure-tabla.pdf'));
    storagePath = `e2e/${randomUUID()}.pdf`;
    const upload = await supabaseServer.storage.from('compiler-materials')
      .upload(storagePath, bytes, { contentType: 'application/pdf' });
    if (upload.error) throw upload.error;

    const { data: material, error: materialError } = await supabaseServer.from('compiler_materials').insert({
      scope_id: ROOT_SCOPE_ID,
      material_kind: 'pdf',
      original_filename: 'brochure-tabla.pdf',
      storage_path: storagePath,
      mime_type: 'application/pdf',
      reading_status: 'ready',
      checksum: createHash('sha256').update(bytes).digest('hex'),
    }).select('id').single();
    if (materialError) throw materialError;
    materialId = material.id;

    const { data: run, error: runError } = await supabaseServer.from('compiler_runs').insert({
      scope_id: ROOT_SCOPE_ID,
      material_ids: [materialId],
      status: 'running',
      current_stage: 'extract_facts',
    }).select('id').single();
    if (runError) throw runError;
    runId = run.id;

    await documentCompilerService.runNextStage(runId!);
    const facts = await documentCompilerRepository.getFacts(runId!);
    assert(facts.length > 0, 'la compilación extrae hechos de un PDF real');
    assert(
      facts.every((fact: any) => fact.page_number > 0),
      'ningún hecho se conserva sin procedencia'
    );

    await supabaseServer.from('compiler_runs').update({ current_stage: 'consolidate_facts' }).eq('id', runId!);
    await documentCompilerService.runNextStage(runId!);

    // Primera compuerta. La impone la propia base: un CHECK impide siquiera
    // mover la ejecución a una etapa de contenido sin el árbol aprobado, así
    // que no depende de que el código se acuerde de comprobarlo.
    const { error: gateError } = await supabaseServer.from('compiler_runs')
      .update({ current_stage: 'catalog' }).eq('id', runId!);
    assert(!!gateError, 'la base rechaza avanzar a contenido sin aprobar la estructura');

    const { data: stillWaiting } = await supabaseServer.from('compiler_runs')
      .select('current_stage, tree_approved_at').eq('id', runId!).single();
    assert(
      stillWaiting?.current_stage === 'tree' && !stillWaiting.tree_approved_at,
      'la ejecución se queda esperando la aprobación de la estructura'
    );

    await documentCompilerRepository.approveTree(runId!, null);
    await supabaseServer.from('compiler_runs').update({ current_stage: 'catalog', status: 'running' }).eq('id', runId!);
    await documentCompilerService.runNextStage(runId!);

    const { data: coverage } = await supabaseServer.from('compiler_coverage')
      .select('intent_name, status').eq('run_id', runId!);
    const covered = (coverage || []).filter(row => row.status === 'covered');
    assert(covered.length > 0, `el catálogo reporta preguntas cubiertas (${covered.map(c => c.intent_name).join(', ')})`);

    await documentCompilerService.runNextStage(runId!);
    const { data: proposals } = await supabaseServer.from('compiler_proposals')
      .select('id, intent_id, message_text, review_signals, approval_status').eq('run_id', runId!);
    assert((proposals || []).length > 0, 'la compilación produce propuestas de respuesta');
    const withSignals = (proposals || []).filter(p => (p.review_signals || []).length > 0);
    console.log(`   ${proposals!.length} propuestas, ${withSignals.length} con señales de revisión`);

    const proposal = proposals![0];
    const rendered = JSON.stringify(proposal.message_text).toLowerCase();
    assert(
      !/(agend|programar una (visita|cita))/.test(rendered),
      'el contenido compilado no invita a agendar por su cuenta'
    );

    // Segunda compuerta: lo propuesto no llega al lead sin aprobar.
    const { count: beforeApproval } = await supabaseServer.from('bot_responses')
      .select('id', { count: 'exact', head: true })
      .eq('compiler_proposal_id', proposal.id);
    assert(beforeApproval === 0, 'una propuesta pendiente no existe como respuesta del bot');

    const { data: admin } = await supabaseServer.from('admin_users').select('id').eq('is_active', true).limit(1).single();
    responseId = await documentCompilerRepository.approveProposal(proposal.id, admin!.id);
    assert(!!responseId, 'aprobar publica la respuesta');

    const { data: published } = await supabaseServer.from('bot_responses')
      .select('id, origin, intent_id, response_fact_dependencies(fact_id)')
      .eq('id', responseId!).single();
    assert(published?.origin === 'compiler', 'la respuesta publicada queda marcada como compilada');
    assert(
      (published?.response_fact_dependencies || []).length > 0,
      'la respuesta publicada conserva de qué hechos depende'
    );

    // El lead recibe la respuesta compilada por el matcher, sin compilador de por medio.
    intentDetectionService.invalidateAll();
    const { data: intent } = await supabaseServer.from('intent_configurations')
      .select('intent_name, keywords').eq('id', published!.intent_id).single();
    const trigger = (intent?.keywords || [])[0] || intent?.intent_name || 'precio';

    const result = await messageProcessor.processMessage(phone, trigger, `e2e-${suffix}`, 'E2E');
    assert(!result.isFallback, `un lead que pregunta "${trigger}" recibe respuesta, no fallback`);
    assert(result.responses.length > 0, 'la respuesta llega por el camino normal del bot');
    console.log(`   respuesta al lead: ${JSON.stringify(result.responses[0]).slice(0, 120)}`);

    console.log('\nDocument compiler end-to-end verified');
  } finally {
    await supabaseServer.from('users').delete().eq('phone_number', phone);
    if (responseId) await supabaseServer.from('bot_responses').delete().eq('id', responseId);
    if (runId) await supabaseServer.from('compiler_runs').delete().eq('id', runId);
    if (materialId) await supabaseServer.from('compiler_materials').delete().eq('id', materialId);
    if (storagePath) await supabaseServer.storage.from('compiler-materials').remove([storagePath]);
    await supabaseServer.from('bot_config').update({ config_value: previousTyping }).eq('config_key', 'typing_indicator_enabled');
    intentDetectionService.invalidateAll();
  }
}

main().catch(error => {
  console.error('Document compiler end-to-end failed:', error.message || error);
  process.exit(1);
});
