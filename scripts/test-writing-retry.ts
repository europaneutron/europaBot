/**
 * Que un objetivo de redaccion sin propuesta se reintente antes de darlo por
 * hueco, y que el aviso nombre el alcance.
 *
 * Se hace fallar al modelo a proposito: el doble devuelve un objetivo de menos
 * en la primera llamada. Esa omision paso una vez en seis corridas reales --el
 * precio del Modelo Aura se quedo sin publicar-- y esperar a que se repita no
 * es una prueba.
 *
 *   npx tsx scripts/test-writing-retry.ts
 */
import { randomUUID, createHash } from 'node:crypto';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.development.local') });
config({ path: resolve(process.cwd(), '.env.local') });

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Fallo: ${message}`);
  console.log(`OK: ${message}`);
}

function proposalFor(target: any) {
  return {
    proposal_key: target.proposal_key,
    intent_name: target.intent_name,
    response: `Respuesta de ${target.intent_name}.`,
    keywords: ['precio', 'costo'],
    synonyms: ['cuanto cuesta', 'valor'],
    typos: ['presio'],
    phrases: ['cuanto cuesta', 'que precio tiene', 'cuanto vale'],
    question_variants: ['cuanto cuesta', 'que precio tiene'],
    offers_intent_name: null,
  };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) {
    throw new Error('Este script solo puede escribir contra Supabase local');
  }

  const { supabaseServer } = await import('../src/services/supabase/server-client');
  const { ROOT_SCOPE_ID, scopeRepository } = await import('../src/data/repositories/scope.repository');
  const { documentCompilerRepository } = await import('../src/data/repositories/document-compiler.repository');
  const { DocumentCompilerService } = await import('../src/core/document-compiler/document-compiler.service');

  const suffix = randomUUID().slice(0, 8);
  const scopeIds: string[] = [];
  let runId: string | null = null;
  let materialId: string | null = null;

  // El doble del modelo: en la primera llamada omite el objetivo del segundo
  // modelo; en la segunda --el reintento-- responde todo lo que se le pida.
  let calls: Array<{ keys: string[] }> = [];
  let omitOnFirstCall = true;
  class StubbedCompiler extends DocumentCompilerService {
    protected async askModelToWrite(_openai: any, request: any) {
      const targets = JSON.parse(String(request.input).split('Objetivos: ')[1]);
      calls.push({ keys: targets.map((target: any) => target.proposal_key) });
      const answered = omitOnFirstCall && calls.length === 1
        ? targets.slice(0, -1)
        : targets;
      return { output_text: JSON.stringify({ proposals: answered.map(proposalFor) }) };
    }
  }

  try {
    const text = `material ${suffix}`;
    const { data: material, error: materialError } = await supabaseServer
      .from('compiler_materials').insert({
        scope_id: ROOT_SCOPE_ID,
        material_kind: 'text',
        original_filename: `retry-${suffix}.txt`,
        mime_type: 'text/plain',
        plain_text: text,
        reading_status: 'ready',
        checksum: createHash('sha256').update(text).digest('hex'),
      }).select('id').single();
    if (materialError) throw materialError;
    materialId = material.id;

    const { data: development, error: developmentError } = await supabaseServer
      .from('scopes').insert({
        parent_id: ROOT_SCOPE_ID,
        name: `Retry ${suffix}`,
        slug: `retry-${suffix}`,
        is_active: true,
      }).select('id').single();
    if (developmentError) throw developmentError;
    scopeIds.push(development.id);

    const { data: models, error: modelsError } = await supabaseServer
      .from('scopes').insert([
        { parent_id: development.id, name: `Uno ${suffix}`, slug: `uno-${suffix}`, is_active: true },
        { parent_id: development.id, name: `Dos ${suffix}`, slug: `dos-${suffix}`, is_active: true },
      ]).select('id, name');
    if (modelsError) throw modelsError;
    scopeIds.push(...models.map(model => model.id));
    scopeRepository.invalidateCache();

    const { data: run, error: runError } = await supabaseServer.from('compiler_runs').insert({
      scope_id: ROOT_SCOPE_ID,
      material_ids: [material.id],
      current_stage: 'content',
      status: 'running',
      tree_approved_at: new Date().toISOString(),
      replacement_mode: 'replace',
    }).select('*').single();
    if (runError) throw runError;
    runId = run.id;

    // Un precio propio por modelo: dos objetivos de redaccion para la misma
    // pregunta, que es la forma en que se perdio el del Modelo Aura.
    const { data: facts, error: factsError } = await supabaseServer
      .from('compiler_facts').insert(models.map((model, index) => ({
        run_id: run.id,
        material_id: material.id,
        scope_id: model.id,
        fact_key: 'precio_desde',
        subject: model.name,
        fact_value: JSON.stringify(`$${1_000_000 + index * 500_000}`),
        fact_type: 'money',
        page_number: 1,
        provenance_confidence: 1,
        fingerprint: `retry-${suffix}-${index}`,
      }))).select('id');
    if (factsError) throw factsError;

    const { error: coverageError } = await supabaseServer.from('compiler_coverage').insert({
      run_id: run.id,
      scope_id: ROOT_SCOPE_ID,
      intent_name: 'precio',
      question: '¿Cuál es el precio?',
      status: 'covered',
      source: 'preset',
      fact_ids: facts.map(fact => fact.id),
    });
    if (coverageError) throw coverageError;

    await new StubbedCompiler().runNextStage(run.id);

    assert(calls.length === 2, `una respuesta incompleta provoca un reintento: ${calls.length} llamadas`);
    assert(
      calls[1].keys.length === 1 && calls[0].keys.includes(calls[1].keys[0]),
      `el reintento pide solo lo que falto: ${JSON.stringify(calls[1].keys)}`
    );

    const review = await documentCompilerRepository.getReview(run.id);
    assert(
      review.proposals.length === calls[0].keys.length,
      `todos los objetivos terminan con propuesta: ${review.proposals.length} de ${calls[0].keys.length}`
    );
    assert(
      review.coverage.every((row: any) => !row.placement_error),
      `un objetivo recuperado no deja hueco anotado: ${JSON.stringify(review.coverage.map((row: any) => row.placement_error))}`
    );

    // Ahora el modelo insiste en omitirlo: el hueco se anota, con el nombre del
    // alcance y no con su identificador.
    calls = [];
    const { data: secondRun, error: secondRunError } = await supabaseServer.from('compiler_runs').insert({
      scope_id: ROOT_SCOPE_ID,
      material_ids: [material.id],
      current_stage: 'content',
      status: 'running',
      tree_approved_at: new Date().toISOString(),
      replacement_mode: 'replace',
    }).select('*').single();
    if (secondRunError) throw secondRunError;
    const stubbornRunId = secondRun.id;
    await supabaseServer.from('compiler_facts').insert(models.map((model, index) => ({
      run_id: stubbornRunId,
      material_id: material.id,
      scope_id: model.id,
      fact_key: 'precio_desde',
      subject: model.name,
      fact_value: JSON.stringify(`$${1_000_000 + index * 500_000}`),
      fact_type: 'money',
      page_number: 1,
      provenance_confidence: 1,
      fingerprint: `stubborn-${suffix}-${index}`,
    })));
    const { data: stubbornFacts } = await supabaseServer
      .from('compiler_facts').select('id').eq('run_id', stubbornRunId);
    await supabaseServer.from('compiler_coverage').insert({
      run_id: stubbornRunId,
      scope_id: ROOT_SCOPE_ID,
      intent_name: 'precio',
      question: '¿Cuál es el precio?',
      status: 'covered',
      source: 'preset',
      fact_ids: (stubbornFacts || []).map(fact => fact.id),
    });

    class StubbornCompiler extends StubbedCompiler {
      protected async askModelToWrite(_openai: any, request: any) {
        const targets = JSON.parse(String(request.input).split('Objetivos: ')[1]);
        calls.push({ keys: targets.map((target: any) => target.proposal_key) });
        return {
          output_text: JSON.stringify({ proposals: targets.slice(0, -1).map(proposalFor) }),
        };
      }
    }
    await new StubbornCompiler().runNextStage(stubbornRunId);

    const stubbornReview = await documentCompilerRepository.getReview(stubbornRunId);
    const placementError = stubbornReview.coverage
      .map((row: any) => row.placement_error)
      .find(Boolean) || '';
    assert(
      placementError.length > 0
      && !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(placementError),
      `el hueco nombra el alcance, no su identificador: ${placementError}`
    );
    assert(
      calls.length === 2,
      `un modelo que insiste igual se reintenta una sola vez: ${calls.length} llamadas`
    );

    await supabaseServer.from('compiler_proposals').delete().eq('run_id', stubbornRunId);
    await supabaseServer.from('compiler_coverage').delete().eq('run_id', stubbornRunId);
    await supabaseServer.from('compiler_facts').delete().eq('run_id', stubbornRunId);
    await supabaseServer.from('compiler_runs').delete().eq('id', stubbornRunId);
  } finally {
    if (runId) {
      await supabaseServer.from('compiler_proposals').delete().eq('run_id', runId);
      await supabaseServer.from('compiler_coverage').delete().eq('run_id', runId);
      await supabaseServer.from('compiler_facts').delete().eq('run_id', runId);
      await supabaseServer.from('compiler_runs').delete().eq('id', runId);
    }
    for (const scopeId of scopeIds.reverse()) {
      const { data: intents } = await supabaseServer
        .from('intent_configurations').select('id').eq('scope_id', scopeId);
      for (const intent of intents || []) {
        await supabaseServer.from('bot_responses').delete().eq('intent_id', intent.id);
        await supabaseServer.from('intent_configurations').delete().eq('id', intent.id);
      }
      await supabaseServer.from('scopes').delete().eq('id', scopeId);
    }
    if (materialId) await supabaseServer.from('compiler_materials').delete().eq('id', materialId);
    scopeRepository.invalidateCache();
  }
}

main()
  .then(() => console.log('\nReintento de redacción verificado: el modelo puede fallar y el hueco se ve'))
  .catch(error => { console.error(error); process.exit(1); });
