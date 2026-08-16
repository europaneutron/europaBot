import { randomUUID } from 'node:crypto';
import { documentCompilerService } from '@/core/document-compiler/document-compiler.service';
import {
  normalizeScopeAlias,
  normalizeVocabulary,
  toClientVocabulary,
  toneSamples,
} from '@/core/onboarding/client-vocabulary';
import type { BrandTone, OnboardingAnswers } from '@/data/models/onboarding.model';
import { clientBrandRepository } from '@/data/repositories/client-brand.repository';
import { documentCompilerRepository } from '@/data/repositories/document-compiler.repository';
import { onboardingRepository } from '@/data/repositories/onboarding.repository';
import { scopeRoutingRepository } from '@/data/repositories/scope-routing.repository';
import { ROOT_SCOPE_ID, scopeRepository } from '@/data/repositories/scope.repository';

function projectSlug(name: string): string {
  const normalized = normalizeScopeAlias(name).replace(/\s+/g, '-');
  return `${normalized || 'proyecto'}-${randomUUID().slice(0, 8)}`;
}

function mergeAnswers(
  current: OnboardingAnswers,
  values: Partial<OnboardingAnswers>
): OnboardingAnswers {
  return { ...current, ...values };
}

function uniqueAliases(values: string[]) {
  const byNormalized = new Map<string, string>();
  for (const value of values) {
    const alias = value.trim();
    const normalizedAlias = normalizeScopeAlias(alias);
    if (alias && normalizedAlias && !byNormalized.has(normalizedAlias)) {
      byNormalized.set(normalizedAlias, alias);
    }
  }
  return Array.from(byNormalized, ([normalizedAlias, alias]) => ({ alias, normalizedAlias }));
}

export class OnboardingService {
  async getState(adminId: string) {
    const [brand, projects] = await Promise.all([
      clientBrandRepository.get(),
      scopeRepository.getScopes(),
    ]);
    let session = await onboardingRepository.getLatest(adminId);
    if (!session || session.status === 'abandoned') {
      session = await onboardingRepository.create(adminId);
    }
    const run = session.run_id
      ? await documentCompilerRepository.getRun(session.run_id)
      : null;
    const facts = run && ['content', 'review', 'completed'].includes(run.current_stage)
      ? await documentCompilerRepository.getFacts(run.id)
      : [];
    const sampleFact = facts.find((fact: any) => fact.fact_type === 'money');
    const sampleValue = sampleFact
      ? (typeof sampleFact.fact_value === 'string'
          ? sampleFact.fact_value
          : JSON.stringify(sampleFact.fact_value))
      : undefined;
    const vocabulary = toClientVocabulary(brand);
    return {
      session,
      run,
      brand,
      vocabulary,
      samples: toneSamples(session.answers.project_name || '', sampleValue),
      projects: projects.filter(scope => scope.parent_id === ROOT_SCOPE_ID && scope.is_active),
      processing: this.processingMessage(run, Boolean(session.answers.tone)),
    };
  }

  async startNew(adminId: string) {
    await onboardingRepository.abandonActive(adminId);
    const brand = await clientBrandRepository.get();
    const session = await onboardingRepository.create(adminId);
    if (!brand.is_configured) return session;
    return onboardingRepository.update(session.id, {
      step: 2,
      answers: { vocabulary: true },
    });
  }

  async saveVocabulary(
    adminId: string,
    values: { singular: string; plural: string }
  ) {
    const session = await this.requireActiveSession(adminId);
    await clientBrandRepository.update({
      projectSingular: normalizeVocabulary(values.singular, 'desarrollo'),
      projectPlural: normalizeVocabulary(values.plural, 'desarrollos'),
      configured: true,
    });
    return onboardingRepository.update(session.id, {
      step: Math.max(session.current_step, 2),
      answers: mergeAnswers(session.answers, { vocabulary: true }),
    });
  }

  async updateBrand(values: { singular: string; plural: string; tone: BrandTone }) {
    return clientBrandRepository.update({
      projectSingular: normalizeVocabulary(values.singular, 'desarrollo'),
      projectPlural: normalizeVocabulary(values.plural, 'desarrollos'),
      tone: values.tone,
      configured: true,
    });
  }

  async saveProject(adminId: string, values: { name: string; aliases: string[] }) {
    const session = await this.requireActiveSession(adminId);
    if (session.scope_id) return session;

    const name = values.name.trim();
    const scope = await scopeRepository.create({
      name,
      slug: projectSlug(name),
      parent_id: ROOT_SCOPE_ID,
      scope_type: 'development',
    });
    const aliases = uniqueAliases([name, ...values.aliases]);
    await scopeRoutingRepository.createAliases(scope.id, aliases);
    return onboardingRepository.update(session.id, {
      step: 3,
      scopeId: scope.id,
      answers: mergeAnswers(session.answers, {
        project_name: name,
        aliases: aliases.map(item => item.alias),
      }),
    });
  }

  async saveVisitFlow(adminId: string, values: {
    choice: 'decided' | 'guided' | 'unsure';
    partNames: string[];
  }) {
    const session = await this.requireActiveSession(adminId);
    if (!session.scope_id) throw new Error('Primero agrega el proyecto');
    if (session.answers.visit_flow) return session;

    const partNames = values.choice === 'decided'
      ? values.partNames.map(name => name.trim()).filter(Boolean)
      : [];
    for (const name of partNames) {
      const part = await scopeRepository.create({
        name,
        slug: projectSlug(`${session.answers.project_name || 'proyecto'}-${name}`),
        parent_id: session.scope_id,
        scope_type: 'model',
      });
      await scopeRoutingRepository.createAliases(part.id, uniqueAliases([name]));
    }

    return onboardingRepository.update(session.id, {
      step: 4,
      answers: mergeAnswers(session.answers, {
        visit_flow: values.choice,
        part_names: partNames,
      }),
    });
  }

  async confirmGoal(adminId: string) {
    const session = await this.requireActiveSession(adminId);
    return onboardingRepository.update(session.id, {
      step: 5,
      answers: mergeAnswers(session.answers, { goal_confirmed: true }),
    });
  }

  async attachRun(adminId: string, runId: string) {
    const session = await this.requireActiveSession(adminId);
    return onboardingRepository.update(session.id, {
      step: 6,
      runId,
      answers: mergeAnswers(session.answers, { material_received: true }),
    });
  }

  async saveTone(adminId: string, tone: BrandTone) {
    const session = await this.requireActiveSession(adminId);
    await clientBrandRepository.update({ tone, configured: true });
    return onboardingRepository.update(session.id, {
      answers: mergeAnswers(session.answers, { tone }),
    });
  }

  async advance(adminId: string) {
    const session = await this.requireActiveSession(adminId);
    if (!session.run_id) return session;
    let run = await documentCompilerRepository.getRun(session.run_id);

    if (run.current_stage === 'tree') {
      run = await documentCompilerRepository.approveTree(run.id, adminId);
    } else if (run.current_stage === 'content' && !session.answers.tone) {
      return session;
    } else if (run.current_stage !== 'review' && run.current_stage !== 'completed') {
      run = await documentCompilerService.runNextStage(run.id);
    }

    if (run.current_stage === 'review' || run.current_stage === 'completed') {
      return onboardingRepository.update(session.id, {
        step: 7,
        status: 'completed',
        completedAt: new Date().toISOString(),
      });
    }
    return session;
  }

  private async requireActiveSession(adminId: string) {
    const session = await onboardingRepository.getLatest(adminId);
    if (!session || session.status !== 'in_progress') {
      throw new Error('No hay un recorrido activo');
    }
    return session;
  }

  private processingMessage(run: any, toneChosen: boolean) {
    if (!run) return null;
    if (run.status === 'failed') {
      return {
        kind: 'error',
        title: 'No pudimos preparar el contenido',
        detail: 'Revisa el material y vuelve a intentarlo. Lo que ya respondiste sigue guardado.',
      };
    }
    if (run.current_stage === 'content' && !toneChosen) {
      return {
        kind: 'decision',
        title: 'El material ya está listo',
        detail: 'Elige cómo debe sonar el bot para redactar las respuestas.',
      };
    }
    if (run.current_stage === 'review' || run.current_stage === 'completed') {
      return {
        kind: 'ready',
        title: 'Tus respuestas están listas para revisar',
        detail: 'Lo que necesita atención aparece primero.',
      };
    }
    return {
      kind: 'working',
      title: 'Estamos preparando tu contenido',
      detail: 'Ahora estamos leyendo el material y organizando las respuestas. Puedes volver más tarde.',
    };
  }
}

export const onboardingService = new OnboardingService();
