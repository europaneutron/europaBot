import { config } from 'dotenv';
import { resolve } from 'node:path';
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
  const scopeId = '00000000-0000-4000-8000-000000000001';
  const suffix = randomUUID().slice(0, 8);
  let materialId: string | null = null;
  let runId: string | null = null;
  let responseId: string | null = null;
  let interruptedRunId: string | null = null;

  try {
    const { data: intent, error: intentError } = await supabaseServer
      .from('intent_configurations')
      .select('id')
      .eq('scope_id', scopeId)
      .eq('intent_name', 'precio')
      .single();
    if (intentError) throw intentError;

    const checkpoint = { extraction_response_id: `checkpoint-${suffix}` };
    const { data: interruptedRun, error: interruptedError } = await supabaseServer
      .from('compiler_runs')
      .insert({
        scope_id: scopeId,
        current_stage: 'tree',
        status: 'failed',
        stage_checkpoint: checkpoint,
        last_error: 'Interrupción simulada',
      })
      .select('id')
      .single();
    if (interruptedError) throw interruptedError;
    interruptedRunId = interruptedRun.id;
    const { documentCompilerRepository } = await import('../src/data/repositories/document-compiler.repository');
    const resumed = await documentCompilerRepository.approveTree(interruptedRun.id, null);
    assert(resumed.current_stage === 'catalog', 'una ejecución interrumpida retoma desde su etapa guardada');
    assert(
      resumed.stage_checkpoint.extraction_response_id === checkpoint.extraction_response_id,
      'retomar conserva el resultado de las etapas completas'
    );

    const text = `Precio desde ${suffix}`;
    const { data: material, error: materialError } = await supabaseServer
      .from('compiler_materials')
      .insert({
        scope_id: scopeId,
        material_kind: 'text',
        original_filename: `integration-${suffix}.txt`,
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
        scope_id: scopeId,
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
        scope_id: scopeId,
        fact_key: 'price_from',
        fact_value: 1_950_000,
        fact_type: 'money',
        page_number: 1,
        fingerprint: createHash('sha256').update('price_from:1950000').digest('hex'),
      })
      .select('id')
      .single();
    if (factError) throw factError;

    const { data: proposal, error: proposalError } = await supabaseServer
      .from('compiler_proposals')
      .insert({
        run_id: run.id,
        scope_id: scopeId,
        intent_id: intent.id,
        response_key: `integration_${suffix}`,
        message_text: { fragments: [{ type: 'text', content: 'Desde $1,950,000.', delay: 0 }] },
        review_signals: ['sensitive_data'],
      })
      .select('id')
      .single();
    if (proposalError) throw proposalError;

    const { error: dependencyError } = await supabaseServer
      .from('compiler_proposal_facts')
      .insert({ proposal_id: proposal.id, fact_id: fact.id });
    if (dependencyError) throw dependencyError;

    const { count: beforeApproval } = await supabaseServer
      .from('bot_responses')
      .select('id', { count: 'exact', head: true })
      .eq('compiler_proposal_id', proposal.id);
    assert(beforeApproval === 0, 'una propuesta pendiente no llega al runtime');

    const { data: approvedId, error: approvalError } = await supabaseServer.rpc(
      'approve_compiler_proposal',
      { proposal_uuid: proposal.id, admin_uuid: null, approved_message: null }
    );
    if (approvalError) throw approvalError;
    responseId = approvedId;

    const { data: approved, error: approvedError } = await supabaseServer
      .from('bot_responses')
      .select('origin, response_fact_dependencies(fact_id)')
      .eq('id', approvedId)
      .single();
    if (approvedError) throw approvedError;
    assert(approved.origin === 'compiler', 'la aprobación publica una respuesta con origen compilador');
    assert(approved.response_fact_dependencies.length === 1, 'la respuesta aprobada conserva su dependencia del hecho');
  } finally {
    // El orden importa, y el error tambien.
    //
    // Borrar un material arrastra sus hechos, pero `compiler_proposal_facts`
    // los referencia con RESTRICT: mientras exista una propuesta que se apoya
    // en un hecho, el material no se deja borrar. La limpieza original pedia
    // el borrado y tiraba el error a la basura, asi que fallaba en silencio y
    // cada ejecucion dejaba una corrida mas. Una de ellas quedo esperando
    // aprobacion de contenido, y como el panel muestra primero esa, el cliente
    // veia un archivo de prueba con un precio inventado en lugar del
    // desarrollo que acababa de dar de alta.
    //
    // Primero las corridas --que arrastran propuestas y hechos--, despues los
    // materiales.
    const purge = async (table: string, column: string, values: string[]) => {
      if (values.length === 0) return;
      const { error } = await supabaseServer.from(table).delete().in(column, values);
      if (error) throw new Error(`No se pudo limpiar ${table}: ${error.message}`);
    };

    if (responseId) await purge('bot_responses', 'id', [responseId]);

    const { data: suffixProposals } = await supabaseServer.from('compiler_proposals')
      .select('run_id').like('response_key', `%${suffix}%`);
    const { data: suffixMaterials } = await supabaseServer.from('compiler_materials')
      .select('id, run_id').like('original_filename', `%${suffix}%`);
    const runIds = Array.from(new Set([
      runId,
      interruptedRunId,
      ...(suffixProposals || []).map(row => row.run_id),
      ...(suffixMaterials || []).map(row => row.run_id),
    ].filter(Boolean))) as string[];
    // Las propuestas antes que la corrida. `compiler_proposal_facts.fact_id` es
    // RESTRICT, y RESTRICT se comprueba en el acto: al borrar la corrida,
    // Postgres arrastra sus hechos sin garantizar que ya haya arrastrado las
    // propuestas que se apoyan en ellos, y la comprobacion salta aunque todo
    // pertenezca a la misma corrida.
    await purge('compiler_proposals', 'run_id', runIds);
    await purge('compiler_runs', 'id', runIds);

    const materialIds = Array.from(new Set([
      materialId,
      ...(suffixMaterials || []).map(row => row.id),
    ].filter(Boolean))) as string[];
    await purge('compiler_materials', 'id', materialIds);

    const { data: leftoverMaterials } = await supabaseServer.from('compiler_materials')
      .select('original_filename').like('original_filename', `%${suffix}%`);
    const { data: leftoverProposals } = await supabaseServer.from('compiler_proposals')
      .select('response_key').like('response_key', `%${suffix}%`);
    const leftovers = [
      ...(leftoverMaterials || []).map(row => `material ${row.original_filename}`),
      ...(leftoverProposals || []).map(row => `propuesta ${row.response_key}`),
    ];
    if (leftovers.length > 0) {
      throw new Error(`La prueba dejo datos en la base: ${leftovers.join(', ')}`);
    }
  }
}

main()
  .then(() => console.log('Document compiler integration verified'))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
