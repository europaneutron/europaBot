/**
 * La tarea 3.4 de `material-sustituye`: que un material con dos desarrollos se
 * materialice entero, con las amenidades fuera y con los dos nombres bajo el
 * control de la persona.
 *
 * Es la verificacion que faltaba, y la que habria destapado que la pantalla
 * solo dejaba corregir el primero: los demas se daban de alta con el nombre
 * que hubiera puesto el modelo.
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

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) {
    throw new Error('Este script solo puede escribir contra Supabase local');
  }

  const { supabaseServer } = await import('../src/services/supabase/server-client');
  const { ROOT_SCOPE_ID } = await import('../src/data/repositories/scope.repository');
  const { onboardingService, proposedStructureFromRun } = await import('../src/core/onboarding/onboarding.service');

  const suffix = randomUUID().slice(0, 8);
  const scopeIds: string[] = [];
  let runId: string | null = null;
  let materialId: string | null = null;
  let sessionId: string | null = null;
  let addRunId: string | null = null;
  let addSessionId: string | null = null;

  const { data: admin } = await supabaseServer.from('admin_users')
    .select('id').eq('is_active', true).limit(1).single();
  if (!admin) throw new Error('No hay administrador activo');

  // La raiz y la marca son unicas: la prueba las toca y las devuelve.
  const { data: rootBefore } = await supabaseServer.from('scopes')
    .select('name').eq('id', ROOT_SCOPE_ID).single();
  const { data: brandBefore } = await supabaseServer.from('client_brand_config')
    .select('*').limit(1).single();

  try {
    const proposedTree = [
      { name: `Residencial Europa ${suffix}`, scope_type: 'proyecto', parent_name: null, aliases: ['Europa'] },
      { name: `Aura ${suffix}`, scope_type: 'opcion', parent_name: `Residencial Europa ${suffix}`, aliases: [] },
      { name: `Vento ${suffix}`, scope_type: 'opcion', parent_name: `Residencial Europa ${suffix}`, aliases: [] },
      { name: `Alberca ${suffix}`, scope_type: 'amenidad', parent_name: `Residencial Europa ${suffix}`, aliases: [] },
      { name: `Residencial Altabrisa ${suffix}`, scope_type: 'proyecto', parent_name: null, aliases: ['Altabrisa'] },
      { name: `Cala ${suffix}`, scope_type: 'opcion', parent_name: `Residencial Altabrisa ${suffix}`, aliases: [] },
      { name: `Ciclovia ${suffix}`, scope_type: 'amenidad', parent_name: `Residencial Altabrisa ${suffix}`, aliases: [] },
    ];

    const text = `estructura ${suffix}`;
    const { data: material, error: materialError } = await supabaseServer
      .from('compiler_materials').insert({
        scope_id: ROOT_SCOPE_ID,
        material_kind: 'text',
        original_filename: `estructura-${suffix}.txt`,
        mime_type: 'text/plain',
        plain_text: text,
        reading_status: 'ready',
        checksum: createHash('sha256').update(text).digest('hex'),
      }).select('id').single();
    if (materialError) throw materialError;
    materialId = material.id;

    const { data: run, error: runError } = await supabaseServer.from('compiler_runs').insert({
      scope_id: ROOT_SCOPE_ID,
      material_ids: [material.id],
      current_stage: 'tree',
      status: 'waiting_tree_approval',
      proposed_tree: proposedTree,
      replacement_mode: 'replace',
      stage_checkpoint: { business_name: `Inmobiliaria ${suffix}` },
    }).select('*').single();
    if (runError) throw runError;
    runId = run.id;

    const structure = proposedStructureFromRun(run);
    assert(structure?.projects.length === 2, 'la propuesta presenta los dos desarrollos, no solo el primero');
    assert(
      structure!.projects[1].partNames.length === 1,
      'cada desarrollo llega con sus propias opciones'
    );
    assert(
      structure!.projects.every(project =>
        !project.partNames.some(name => name.startsWith('Alberca') || name.startsWith('Ciclovia'))
      ),
      'las amenidades no se ofrecen como opciones de venta'
    );

    const { data: session, error: sessionError } = await supabaseServer
      .from('onboarding_sessions').insert({
        admin_id: admin.id, run_id: run.id, current_step: 2, status: 'in_progress',
      }).select('id').single();
    if (sessionError) throw sessionError;
    sessionId = session.id;

    // La persona corrige los dos nombres, no solo el principal.
    await onboardingService.confirmProposedStructure(admin.id, {
      projectName: `Europa ${suffix}`,
      partNames: [`Modelo Aura ${suffix}`, `Modelo Vento ${suffix}`],
      flatten: false,
      projects: [
        { name: `Europa ${suffix}`, partNames: [`Modelo Aura ${suffix}`, `Modelo Vento ${suffix}`] },
        { name: `Altabrisa ${suffix}`, partNames: [`Modelo Cala ${suffix}`] },
      ],
    });

    const { data: created } = await supabaseServer.from('scopes')
      .select('id, name, scope_type, parent_id')
      .like('name', `%${suffix}%`)
      .neq('id', ROOT_SCOPE_ID);
    scopeIds.push(...(created || []).map(scope => scope.id));
    const names = (created || []).map(scope => scope.name);

    assert(names.includes(`Europa ${suffix}`), 'el primer desarrollo se crea con el nombre confirmado');
    assert(names.includes(`Altabrisa ${suffix}`), 'el segundo desarrollo también se crea con el nombre confirmado');
    assert(names.includes(`Modelo Cala ${suffix}`), 'las opciones del segundo desarrollo también se renombran');
    assert(
      !names.some(name => name.startsWith('Alberca') || name.startsWith('Ciclovia')),
      'ninguna amenidad se convierte en alcance'
    );
    assert(
      (created || []).filter(scope => scope.parent_id === ROOT_SCOPE_ID).length === 2,
      'el negocio queda con dos desarrollos colgando, no con uno'
    );
    assert(
      (created || []).every(scope => !(scope as any).is_active !== false || true) &&
      (created || []).length === 5,
      'se crean los dos desarrollos y sus tres opciones, y nada más'
    );

    // Los alias viajan en `metadata` hasta que la publicacion los escribe en
    // `scope_aliases`: asi entran en la misma transaccion que el contenido.
    const { data: withMetadata } = await supabaseServer.from('scopes')
      .select('name, metadata').in('id', scopeIds);
    const secondary = (withMetadata || []).find(scope => scope.name === `Altabrisa ${suffix}`);
    assert(
      ((secondary?.metadata as any)?.compiler_aliases || [])
        .some((alias: string) => alias.toLowerCase() === 'altabrisa'),
      'el alias del segundo desarrollo se conserva al renombrarlo'
    );

    // El negocio se llama como dice el material, no como el primer cliente que
    // uso el bot: la raiz venia sembrada con `Europa` y nadie la renombraba.
    const { data: rootAfter } = await supabaseServer.from('scopes')
      .select('name').eq('id', ROOT_SCOPE_ID).single();
    assert(
      rootAfter?.name === `Inmobiliaria ${suffix}`,
      'la raíz toma el nombre del negocio que trae el material'
    );
    const { data: brandAfter } = await supabaseServer.from('client_brand_config')
      .select('business_name, use_composed_greeting').limit(1).single();
    assert(
      brandAfter?.business_name === `Inmobiliaria ${suffix}`,
      'el saludo compuesto ya tiene con qué nombrar al negocio'
    );
    assert(
      brandAfter?.use_composed_greeting === true,
      'el saludo compuesto queda encendido al adoptar el nombre'
    );

    // Anadir un desarrollo no es rebautizar el negocio.
    const { data: addRun, error: addRunError } = await supabaseServer.from('compiler_runs').insert({
      scope_id: ROOT_SCOPE_ID,
      material_ids: [material.id],
      current_stage: 'tree',
      status: 'waiting_tree_approval',
      proposed_tree: [{ name: `Anexo ${suffix}`, scope_type: 'proyecto', parent_name: null, aliases: [] }],
      replacement_mode: 'add',
      stage_checkpoint: { business_name: `Otra Razon Social ${suffix}` },
    }).select('*').single();
    if (addRunError) throw addRunError;
    addRunId = addRun.id;
    // Solo puede haber una sesion activa por administrador.
    await supabaseServer.from('onboarding_sessions')
      .update({ status: 'abandoned' }).eq('id', sessionId);
    const { data: addSession, error: addSessionError } = await supabaseServer
      .from('onboarding_sessions').insert({
        admin_id: admin.id, run_id: addRun.id, current_step: 2, status: 'in_progress',
      }).select('id').single();
    if (addSessionError) throw addSessionError;
    addSessionId = addSession.id;
    await onboardingService.confirmProposedStructure(admin.id, {
      projectName: `Anexo ${suffix}`,
      partNames: [],
      flatten: false,
      projects: [{ name: `Anexo ${suffix}`, partNames: [] }],
    });
    const { data: addedScopes } = await supabaseServer.from('scopes')
      .select('id').like('name', `Anexo ${suffix}`);
    scopeIds.push(...(addedScopes || []).map(scope => scope.id));
    const { data: rootAfterAdd } = await supabaseServer.from('scopes')
      .select('name').eq('id', ROOT_SCOPE_ID).single();
    assert(
      rootAfterAdd?.name === `Inmobiliaria ${suffix}`,
      'añadir un desarrollo no rebautiza el negocio'
    );
  } finally {
    await supabaseServer.from('scopes')
      .update({ name: rootBefore?.name }).eq('id', ROOT_SCOPE_ID);
    if (brandBefore) {
      await supabaseServer.from('client_brand_config')
        .update({
          business_name: brandBefore.business_name,
          use_composed_greeting: brandBefore.use_composed_greeting,
        })
        .eq('root_scope_id', brandBefore.root_scope_id);
    }
    if (scopeIds.length > 0) {
      await supabaseServer.from('scope_aliases').delete().in('scope_id', scopeIds);
      const { data: rows } = await supabaseServer.from('scopes')
        .select('id, parent_id').in('id', scopeIds);
      for (const scope of (rows || []).filter(row => row.parent_id !== ROOT_SCOPE_ID)) {
        await supabaseServer.from('scopes').delete().eq('id', scope.id);
      }
      for (const scope of (rows || []).filter(row => row.parent_id === ROOT_SCOPE_ID)) {
        await supabaseServer.from('scopes').delete().eq('id', scope.id);
      }
    }
    if (addSessionId) await supabaseServer.from('onboarding_sessions').delete().eq('id', addSessionId);
    if (sessionId) await supabaseServer.from('onboarding_sessions').delete().eq('id', sessionId);
    if (addRunId) await supabaseServer.from('compiler_runs').delete().eq('id', addRunId);
    if (runId) await supabaseServer.from('compiler_runs').delete().eq('id', runId);
    if (materialId) await supabaseServer.from('compiler_materials').delete().eq('id', materialId);
    const { count } = await supabaseServer.from('scopes')
      .select('id', { count: 'exact', head: true })
      .like('name', `%${suffix}%`)
      .neq('id', ROOT_SCOPE_ID);
    if ((count || 0) > 0) throw new Error(`La prueba dejó ${count} alcances sin borrar`);
  }
}

main()
  .then(() => console.log('\nEstructura propuesta verificada: el negocio completo, confirmado por una persona'))
  .catch(error => { console.error(error); process.exit(1); });
