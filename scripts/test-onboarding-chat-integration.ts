import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
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

  const suffix = randomUUID().slice(0, 8);
  const email = `onboarding-${suffix}@example.com`;
  const password = `Local-${randomUUID()}-A1`;
  const originalBrand = await clientBrandRepository.get();
  let adminId: string | null = null;
  const scopeIds: string[] = [];
  const runIds: string[] = [];

  try {
    const { data: authData, error: authError } = await supabaseServer.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
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

    await onboardingService.getState(adminId);
    await onboardingService.saveVocabulary(adminId, {
      singular: 'desarrollo',
      plural: 'desarrollos',
    });
    let session = await onboardingService.saveProject(adminId, {
      name: `Toscana ${suffix}`,
      aliases: [`Toscana ${suffix}`, `Toscana Norte ${suffix}`],
    });
    assert(Boolean(session.scope_id), 'el primer proyecto se crea desde el recorrido');
    scopeIds.push(session.scope_id!);

    const aliases = await scopeRoutingRepository.getActiveAliases();
    assert(
      aliases.some(alias => alias.scope_id === session.scope_id && alias.alias === `Toscana Norte ${suffix}`),
      'el ruteo reconoce los nombres dados de alta'
    );

    session = await onboardingService.saveVisitFlow(adminId, {
      choice: 'unsure',
      partNames: [],
    });
    session = await onboardingService.confirmGoal(adminId);
    assert(session.current_step === 5, 'el avance queda guardado y puede retomarse');
    const resumed = await onboardingRepository.getLatest(adminId);
    assert(resumed?.current_step === 5, 'volver al recorrido continua donde se dejo');

    const { data: run, error: runError } = await supabaseServer
      .from('compiler_runs')
      .insert({
        scope_id: session.scope_id,
        current_stage: 'review',
        status: 'waiting_content_approval',
        tree_approved_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (runError) throw runError;
    runIds.push(run.id);
    await onboardingService.attachRun(adminId, run.id);
    await onboardingService.saveTone(adminId, 'friendly');
    session = await onboardingService.advance(adminId);
    assert(session.status === 'completed', 'los defaults permiten terminar el recorrido');

    const { data: firstBefore, error: firstBeforeError } = await supabaseServer
      .from('scopes')
      .select('*')
      .eq('id', scopeIds[0])
      .single();
    if (firstBeforeError) throw firstBeforeError;

    session = await onboardingService.startNew(adminId);
    session = await onboardingService.saveProject(adminId, {
      name: `Milano ${suffix}`,
      aliases: [],
    });
    scopeIds.push(session.scope_id!);
    const { data: firstAfter, error: firstAfterError } = await supabaseServer
      .from('scopes')
      .select('*')
      .eq('id', scopeIds[0])
      .single();
    if (firstAfterError) throw firstAfterError;
    assert(JSON.stringify(firstAfter) === JSON.stringify(firstBefore), 'un segundo proyecto no altera el primero');
    assert(
      Object.keys(firstAfter).sort().join(',') === Object.keys(session.scope_id
        ? (await supabaseServer.from('scopes').select('*').eq('id', session.scope_id).single()).data
        : {}).sort().join(','),
      'un proyecto del recorrido tiene la misma forma que cualquier fila de proyectos'
    );

    console.log('Onboarding chat integration verified');
  } finally {
    if (adminId) {
      await supabaseServer.from('onboarding_sessions').delete().eq('admin_id', adminId);
    }
    if (runIds.length > 0) await supabaseServer.from('compiler_runs').delete().in('id', runIds);
    for (const scopeId of scopeIds.reverse()) {
      await supabaseServer.from('scopes').delete().eq('id', scopeId);
    }
    await clientBrandRepository.update({
      projectSingular: originalBrand.project_singular,
      projectPlural: originalBrand.project_plural,
      tone: originalBrand.tone,
      configured: originalBrand.is_configured,
    });
    if (adminId) await supabaseServer.auth.admin.deleteUser(adminId);
  }
}

main().catch(error => {
  console.error('Onboarding chat integration failed:', error);
  process.exit(1);
});
