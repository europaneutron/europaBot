/**
 * Nombres largos en el alta del recorrido.
 *
 * Dos defectos encontrados probando el recorrido con la factura de un producto
 * de software, cuyo nombre real ocupa 119 caracteres:
 *
 *  1. `scopes.slug` es `varchar(120)` igual que `scopes.name`, y el slug le
 *     suma un sufijo de nueve caracteres. Un nombre que cabe en el nombre no
 *     cabia en el slug, y el alta moria con `value too long`.
 *  2. El alta no es atomica. Al fallar una parte, el proyecto ya creado se
 *     quedaba, y cada reintento creaba otro: cuatro proyectos con el mismo
 *     nombre colgando de la raiz.
 *
 *   npx tsx scripts/test-onboarding-long-names.ts
 */
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
  const { ROOT_SCOPE_ID } = await import('../src/data/repositories/scope.repository');

  const suffix = randomUUID().slice(0, 8);
  const email = `longnames-${suffix}@example.com`;
  let adminId: string | null = null;
  const runIds: string[] = [];
  const materialIds: string[] = [];
  const scopeIds: string[] = [];

  // 119 caracteres: cabe en `scopes.name`, no cabia en el slug.
  const longProjectName = `Microsoft 365 Business Basic - Microsoft 365 Business Basic (no Teams) - One-Year commitment ${suffix} monthly`;
  // 130 caracteres: no cabe ni en el nombre. Sirve para provocar el fallo a
  // media lista y comprobar que no queda basura.
  const overlongPartName = `Parte ${suffix} `.padEnd(130, 'x');

  async function buildRun(names: string[]) {
    const text = `Material ${suffix}: ${names.join(', ')}`;
    const { data: material, error: materialError } = await supabaseServer
      .from('compiler_materials')
      .insert({
        scope_id: ROOT_SCOPE_ID,
        material_kind: 'text',
        original_filename: 'material.txt',
        mime_type: 'text/plain',
        plain_text: text,
        reading_status: 'ready',
        checksum: createHash('sha256').update(text + randomUUID()).digest('hex'),
        created_by: adminId,
      })
      .select('*')
      .single();
    if (materialError) throw materialError;
    materialIds.push(material.id);

    const { data: run, error: runError } = await supabaseServer
      .from('compiler_runs')
      .insert({
        scope_id: ROOT_SCOPE_ID,
        material_ids: [material.id],
        current_stage: 'tree',
        status: 'waiting_tree_approval',
        proposed_tree: names.map((name, index) => (
          index === 0
            ? { name, scope_type: 'development', parent_name: null }
            : { name, scope_type: 'model', parent_name: names[0] }
        )),
        stage_checkpoint: { business_name: `Grupo ${suffix}`, candidate_questions: [] },
        created_by: adminId,
      })
      .select('*')
      .single();
    if (runError) throw runError;
    runIds.push(run.id);
    await supabaseServer.from('compiler_materials').update({ run_id: run.id }).eq('id', material.id);
    return run;
  }

  async function countScopesNamed(name: string) {
    const { data, error } = await supabaseServer
      .from('scopes').select('id').eq('name', name);
    if (error) throw error;
    for (const row of data || []) if (!scopeIds.includes(row.id)) scopeIds.push(row.id);
    return (data || []).length;
  }

  try {
    const { data: authData, error: authError } = await supabaseServer.auth.admin.createUser({
      email, password: `Local-${randomUUID()}-A1`, email_confirm: true,
    });
    if (authError || !authData.user) throw authError || new Error('No se creo el administrador');
    adminId = authData.user.id;
    const { error: adminError } = await supabaseServer.from('admin_users').insert({
      id: adminId, email, full_name: 'Long Names Test', role: 'super_admin', is_active: true,
    });
    if (adminError) throw adminError;

    // 1. Un nombre de 119 caracteres se da de alta sin reventar el slug.
    await onboardingService.getState(adminId);
    const shortPart = `Plan ${suffix}`;
    let run = await buildRun([longProjectName, shortPart]);
    await onboardingService.attachRun(adminId, run.id);
    const session = await onboardingService.confirmProposedStructure(adminId, {
      projectName: longProjectName,
      partNames: [shortPart],
      flatten: false,
    });
    assert(Boolean(session.scope_id), 'un nombre de 119 caracteres se da de alta');

    const { data: created, error: createdError } = await supabaseServer
      .from('scopes').select('id, slug').eq('id', session.scope_id!).single();
    if (createdError) throw createdError;
    scopeIds.push(created.id);
    assert(created.slug.length <= 120, `el slug cabe en la columna (${created.slug.length} caracteres)`);
    const partCount = await countScopesNamed(shortPart);
    assert(partCount === 1, 'la parte tambien queda dada de alta');

    // 2. Una parte imposible no deja el proyecto colgando.
    const secondProjectName = `Proyecto huerfano ${suffix}`;
    await onboardingService.startNew(adminId);
    run = await buildRun([secondProjectName, overlongPartName]);
    await onboardingService.attachRun(adminId, run.id);

    let failed = false;
    try {
      await onboardingService.confirmProposedStructure(adminId, {
        projectName: secondProjectName,
        partNames: [overlongPartName],
        flatten: false,
      });
    } catch {
      failed = true;
    }
    assert(failed, 'un nombre imposible hace fallar el alta');
    const orphanCount = await countScopesNamed(secondProjectName);
    assert(orphanCount === 0, 'el alta fallida no deja el proyecto colgando de la raiz');
  } finally {
    for (const scopeId of scopeIds) {
      await supabaseServer.from('scope_aliases').delete().eq('scope_id', scopeId);
    }
    await supabaseServer.from('compiler_facts').delete().in('run_id', runIds.length ? runIds : ['x']);
    await supabaseServer.from('compiler_materials').delete().in('id', materialIds.length ? materialIds : ['x']);
    await supabaseServer.from('onboarding_sessions').delete().eq('admin_id', adminId || 'x');
    await supabaseServer.from('compiler_proposals').delete().in('run_id', runIds.length ? runIds : ['x']);
    await supabaseServer.from('compiler_coverage').delete().in('run_id', runIds.length ? runIds : ['x']);
    await supabaseServer.from('compiler_runs').delete().in('id', runIds.length ? runIds : ['x']);
    // Con las FK en RESTRICT, un alcance que no se deja borrar es un alcance al
    // que todavia le cuelga algo. Callarlo deja basura en la base local, que es
    // exactamente lo que este test existe para detectar.
    for (const scopeId of scopeIds.reverse()) {
      const { error } = await supabaseServer.from('scopes').delete().eq('id', scopeId);
      if (error) console.error(`No se pudo limpiar el alcance ${scopeId}:`, error.message);
    }
    if (adminId) {
      await supabaseServer.from('admin_users').delete().eq('id', adminId);
      await supabaseServer.auth.admin.deleteUser(adminId);
    }
  }

  console.log('\nTodo en orden.');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
