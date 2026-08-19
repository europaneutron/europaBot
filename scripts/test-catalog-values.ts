import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.development.local') });
config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(supabaseUrl)) {
  throw new Error('Este script solo puede escribir contra Supabase local');
}

async function main() {
const { supabaseServer } = await import('../src/services/supabase/server-client');
const { catalogValueRepository } = await import('../src/data/repositories/catalog-value.repository');
const { buildScopeOptions } = await import('../src/core/conversation/scope-enumeration.service');
const { interpolateMessage } = await import('../src/lib/interpolate-message');

const ROOT_SCOPE_ID = '00000000-0000-4000-8000-000000000001';
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const scopeIds: string[] = [];
const runIds: string[] = [];
const materialIds: string[] = [];
const intentIds: string[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function createRun(mode: 'replace' | 'add', facts: Array<{
  scopeId: string;
  key: string;
  value: string;
  type?: string;
}>) {
  const { data: material, error: materialError } = await supabaseServer
    .from('compiler_materials')
    .insert({
      scope_id: ROOT_SCOPE_ID,
      material_kind: 'text',
      original_filename: `catalog-${suffix}.txt`,
      mime_type: 'text/plain',
      plain_text: 'Material local para verificar catálogo',
      reading_status: 'ready',
      checksum: `catalog-${suffix}-${runIds.length}`,
    })
    .select('id')
    .single();
  if (materialError) throw materialError;
  materialIds.push(material.id);

  const { data: run, error: runError } = await supabaseServer
    .from('compiler_runs')
    .insert({
      scope_id: ROOT_SCOPE_ID,
      material_ids: [material.id],
      replacement_mode: mode,
      status: 'waiting_content_approval',
      current_stage: 'review',
      tree_approved_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (runError) throw runError;
  runIds.push(run.id);

  const { error: factError } = await supabaseServer.from('compiler_facts').insert(
    facts.map((fact, index) => ({
      run_id: run.id,
      material_id: material.id,
      scope_id: fact.scopeId,
      fact_key: fact.key,
      fact_value: fact.value,
      fact_type: fact.type || 'money',
      unit: fact.type === 'number' ? 'recámaras' : 'MXN',
      page_number: 1,
      provenance_confidence: 1,
      fingerprint: `${run.id}-${index}`,
    }))
  );
  if (factError) throw factError;

  return run;
}

async function publish(runId: string) {
  const { error } = await supabaseServer
    .from('compiler_runs')
    .update({ status: 'completed', current_stage: 'completed', completed_at: new Date().toISOString() })
    .eq('id', runId);
  if (error) throw error;
}

try {
  // El ancestro del que se hereda es un desarrollo de la propia prueba, no la
  // raiz: sembrar ahi un valor lo dejaba en el catalogo del negocio real --la
  // limpieza solo borra los alcances creados-- y cualquier alcance sin
  // direccion propia acababa contestando "Avenida Europa 100" a un lead.
  const { data: parentScope, error: parentError } = await supabaseServer
    .from('scopes')
    .insert({ parent_id: ROOT_SCOPE_ID, name: `Desarrollo ${suffix}`, slug: `desarrollo-${suffix}`, scope_type: 'development' })
    .select('id')
    .single();
  if (parentError) throw parentError;
  scopeIds.push(parentScope.id);

  const { data: scopes, error: scopeError } = await supabaseServer
    .from('scopes')
    .insert([
      { parent_id: parentScope.id, name: `Modelo A ${suffix}`, slug: `modelo-a-${suffix}`, scope_type: 'model' },
      { parent_id: parentScope.id, name: `Modelo B ${suffix}`, slug: `modelo-b-${suffix}`, scope_type: 'model' },
    ])
    .select('id, name');
  if (scopeError) throw scopeError;
  scopeIds.push(...scopes.map(scope => scope.id));
  const [scopeA, scopeB] = scopes;

  const firstRun = await createRun('replace', [
    { scopeId: scopeA.id, key: 'precio', value: '$1,850,000 MXN' },
    { scopeId: scopeB.id, key: 'precio', value: '$2,340,000 MXN' },
    { scopeId: parentScope.id, key: 'direccion', value: 'Avenida Europa 100', type: 'location' },
  ]);
  await publish(firstRun.id);

  const [valuesA, valuesB] = await Promise.all([
    catalogValueRepository.getResolvedVariables(scopeA.id),
    catalogValueRepository.getResolvedVariables(scopeB.id),
  ]);
  assert(valuesA.precio === '$1,850,000 MXN', 'El precio del modelo A se perdió');
  assert(valuesB.precio === '$2,340,000 MXN', 'Los precios de dos modelos se pisaron');
  assert(valuesA.direccion === 'Avenida Europa 100', 'El modelo no heredó el valor del desarrollo');

  const interpolationA = interpolateMessage('Desde {precio}. Dirección: {direccion}.', valuesA);
  assert(interpolationA.complete && interpolationA.value.includes('$1,850,000'), 'No resolvió los huecos del modelo');
  const incomplete = interpolateMessage('Desde {precio}. Entrega: {entrega}.', valuesA);
  assert(!incomplete.complete && incomplete.value.includes('{entrega}'), 'Un hueco ausente quedó vacío');

  const { data: intent, error: intentError } = await supabaseServer
    .from('intent_configurations')
    .insert({
      scope_id: scopeA.id,
      intent_name: `catalog_test_${suffix}`,
      display_name: 'Prueba de catálogo',
      is_active: true,
      is_checkpoint: false,
    })
    .select('id')
    .single();
  if (intentError) throw intentError;
  intentIds.push(intent.id);
  const { error: responseError } = await supabaseServer.from('bot_responses').insert({
    intent_id: intent.id,
    intent_name: `catalog_test_${suffix}`,
    response_key: 'main',
    message_text: { fragments: [{ type: 'text', content: 'Entrega: {entrega}', delay: 0 }] },
    response_type: 'fragmented',
    variables: {},
    is_active: true,
  });
  if (responseError) throw responseError;
  const incompleteResponses = await (await import('../src/data/repositories/conversation.repository'))
    .conversationRepository.getBotResponses(intent.id, {}, scopeA.id);
  assert(incompleteResponses.length === 0, 'El runtime devolvió una respuesta con un hueco ausente');

  const optionsBefore = await buildScopeOptions([scopeA.id, scopeB.id], 'precio');
  assert(optionsBefore[0].label.includes('$1.85M'), 'La enumeración no leyó el catálogo');

  const { data: admin, error: adminError } = await supabaseServer
    .from('admin_users')
    .select('id')
    .eq('is_active', true)
    .limit(1)
    .single();
  if (adminError) throw new Error('Se necesita un administrador local activo para probar la edición');
  const { data: valueA, error: valueError } = await supabaseServer
    .from('catalog_values')
    .select('id')
    .eq('scope_id', scopeA.id)
    .eq('value_key', 'precio')
    .single();
  if (valueError) throw valueError;
  await catalogValueRepository.updateValue(valueA.id, {
    value: '$1,990,000 MXN',
    valueType: 'money',
    unit: 'MXN',
  }, admin.id);

  const optionsAfter = await buildScopeOptions([scopeA.id, scopeB.id], 'precio');
  assert(optionsAfter[0].label.includes('$1.99M'), 'Editar el precio no cambió la enumeración');

  const addRun = await createRun('add', [
    { scopeId: scopeA.id, key: 'precio', value: '$2,100,000 MXN' },
  ]);
  await publish(addRun.id);
  const afterAdd = await catalogValueRepository.getResolvedVariables(scopeA.id);
  assert(afterAdd.precio === '$1,990,000 MXN', 'El modo añadir reemplazó un valor existente');

  const replaceRun = await createRun('replace', [
    { scopeId: scopeA.id, key: 'precio', value: '$2,100,000 MXN' },
  ]);
  const warnings = await catalogValueRepository.getReplacementWarnings({
    id: replaceRun.id,
    replacement_mode: 'replace',
  });
  assert(warnings.length === 1 && warnings[0].incomingValue === '$2,100,000 MXN', 'No avisó la corrección manual que sería sustituida');
  await publish(replaceRun.id);
  const afterReplace = await catalogValueRepository.getResolvedVariables(scopeA.id);
  assert(afterReplace.precio === '$2,100,000 MXN', 'El material no ganó en modo sustituir');

  console.log('Catálogo y variables: verificación completada');
} finally {
  if (intentIds.length > 0) await supabaseServer.from('intent_configurations').delete().in('id', intentIds);
  if (runIds.length > 0) await supabaseServer.from('compiler_runs').delete().in('id', runIds);
  await supabaseServer.from('catalog_values').delete().in('scope_id', scopeIds);
  if (materialIds.length > 0) await supabaseServer.from('compiler_materials').delete().in('id', materialIds);
  if (scopeIds.length > 0) await supabaseServer.from('scopes').delete().in('id', scopeIds);
}
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
