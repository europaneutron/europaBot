/**
 * Recorrido de aceptacion de `material-sustituye`, de punta a punta y sobre la
 * base tal como este: subir los dos materiales de FYMSA en una sola corrida,
 * compilar, publicar y conversar.
 *
 * No siembra contenido. Todo lo que el bot conteste al final tiene que haber
 * salido del material.
 */
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.development.local') });
config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) {
    throw new Error('Este recorrido solo corre contra Supabase local');
  }

  const { supabaseServer } = await import('../src/services/supabase/server-client');
  const { ROOT_SCOPE_ID, scopeRepository } = await import('../src/data/repositories/scope.repository');
  const { documentCompilerRepository } = await import('../src/data/repositories/document-compiler.repository');
  const { documentCompilerService } = await import('../src/core/document-compiler/document-compiler.service');
  const { proposedStructureFromRun, onboardingService } = await import('../src/core/onboarding/onboarding.service');
  const { messageProcessor } = await import('../src/core/conversation/message-processor');
  const { intentDetectionService } = await import('../src/core/intent-engine/intent-detection.service');

  const { data: admin } = await supabaseServer.from('admin_users')
    .select('id').eq('is_active', true).limit(1).single();
  if (!admin) throw new Error('No hay administrador activo. Corre scripts/seed-local-admin.ts');

  const before = await supabaseServer.from('scopes').select('name').eq('is_active', true);
  console.log('\n== Antes ==');
  console.log('alcances:', (before.data || []).map(s => s.name).join(', '));

  const materialRows = ['fymsa-europa.txt', 'fymsa-altabrisa.txt'].map(filename => {
    const text = readFileSync(resolve(process.cwd(), 'scripts/fixtures/compiler', filename), 'utf8');
    return {
      scope_id: ROOT_SCOPE_ID,
      material_kind: 'text' as const,
      original_filename: filename,
      mime_type: 'text/plain',
      plain_text: text,
      reading_status: 'ready' as const,
      checksum: createHash('sha256').update(text).digest('hex'),
      created_by: admin.id,
    };
  });
  const { data: materials, error: materialError } = await supabaseServer
    .from('compiler_materials').insert(materialRows).select('id');
  if (materialError) throw materialError;
  const materialIds = (materials || []).map(row => row.id);

  const run = await documentCompilerRepository.createRun(
    ROOT_SCOPE_ID, materialIds, admin.id, 'replace'
  );
  console.log('\n== Compilando ==');
  await documentCompilerService.runNextStage(run.id);
  await supabaseServer.from('compiler_runs')
    .update({ current_stage: 'consolidate_facts' }).eq('id', run.id);
  await documentCompilerService.runNextStage(run.id);

  const withTree = await documentCompilerRepository.getRun(run.id);
  const nodes: any[] = withTree.proposed_tree || [];
  console.log('\nestructura propuesta:');
  for (const node of nodes) {
    console.log(`  ${node.parent_name ? '  ' : ''}${node.name} [${node.scope_type}]${
      node.aliases?.length ? ` alias: ${node.aliases.join(', ')}` : ''}`);
  }

  const structure = proposedStructureFromRun(withTree);
  console.log('\nlo que la pantalla presenta para confirmar:');
  for (const project of structure?.projects || []) {
    console.log(`  ${project.name}: ${project.partNames.join(', ') || '(sin opciones)'}`);
  }

  // El camino real: la persona confirma cada desarrollo con sus opciones y el
  // onboarding materializa el arbol entero.
  const { data: admin2 } = await supabaseServer.from('admin_users').select('id').limit(1).single();
  const { data: session } = await supabaseServer.from('onboarding_sessions')
    .insert({ admin_id: admin2!.id, run_id: run.id, current_step: 2, status: 'in_progress' })
    .select('id').single();
  await onboardingService.confirmProposedStructure(admin.id, {
    projectName: structure!.projects[0].name,
    partNames: structure!.projects[0].partNames,
    flatten: false,
    projects: structure!.projects,
  });
  await supabaseServer.from('onboarding_sessions').delete().eq('id', session!.id);

  await supabaseServer.from('compiler_runs')
    .update({ current_stage: 'catalog', status: 'running' }).eq('id', run.id);
  await documentCompilerService.runNextStage(run.id);
  await documentCompilerService.runNextStage(run.id);

  const review = await documentCompilerRepository.getReview(run.id);
  console.log(`\n${review.proposals.length} propuestas`);
  const vocabulary = review.proposals.slice(0, 3).map((proposal: any) => ({
    pregunta: proposal.intent_configurations?.intent_name,
    alcance: proposal.scopes?.name,
    keywords: proposal.matcher_patterns?.keywords,
    sinonimos: proposal.matcher_patterns?.synonyms,
    frases: proposal.matcher_patterns?.phrases,
  }));
  console.log('\nvocabulario generado (primeras tres):');
  console.log(JSON.stringify(vocabulary, null, 2));

  console.log('\n== Publicando ==');
  const result = await documentCompilerRepository.publishRun(run.id, admin.id);
  console.log('resultado:', JSON.stringify(result));

  const after = await supabaseServer.from('scopes').select('name').eq('is_active', true);
  console.log('\nalcances activos:', (after.data || []).map(s => s.name).join(', '));

  intentDetectionService.invalidateAll();
  scopeRepository.invalidateCache();

  console.log('\n== Conversando ==');
  const phone = `52199${Math.floor(Math.random() * 900000000)}`;
  const turnos = [
    'hola',
    'me interesa Europa',
    'que casas manejan',
    'cuanto cuesta',
    'precio de Solara',
    'donde estan ubicados',
    'aceptan mascotas',
    'quiero agendar una visita',
  ];
  for (const turno of turnos) {
    const res = await messageProcessor.processMessage(
      phone, turno, `wt_${Date.now()}_${Math.random()}`, 'Recorrido',
      { suppressExternalMessages: true }
    );
    const texto = res.responses
      .map((item: any) => typeof item === 'string' ? item : item?.fragments?.[0]?.content ?? '')
      .join(' | ');
    const marca = res.isFallback ? ' [FALLBACK]' : '';
    console.log(`\nlead: ${turno}`);
    console.log(`  bot:${marca} ${String(texto).slice(0, 160).replace(/\n/g, ' ')}`);
  }

  const { data: lead } = await supabaseServer.from('users')
    .select('id').eq('phone_number', phone).maybeSingle();
  if (lead) {
    for (const table of ['appointments', 'conversations', 'user_scope_progress', 'user_progress', 'user_sessions', 'user_checkpoints']) {
      await supabaseServer.from(table).delete().eq('user_id', lead.id);
    }
    await supabaseServer.from('users').delete().eq('id', lead.id);
  }
  console.log('\nEl lead de prueba se borro. El bot publicado se queda para que lo recorras.');
}

main().catch(error => { console.error(error); process.exit(1); });
