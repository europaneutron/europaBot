import { randomUUID } from 'node:crypto';
import { documentCompilerService } from '@/core/document-compiler/document-compiler.service';
import { shortScopeAlias } from '@/core/document-compiler/compiler-rules';
import {
  composeBusinessGreeting,
  normalizeScopeAlias,
  normalizeVocabulary,
  toClientVocabulary,
  toneSamples,
} from '@/core/onboarding/client-vocabulary';
import { isSellableScopeType } from '@/data/models/document-compiler.model';
import type { BrandTone, OnboardingAnswers } from '@/data/models/onboarding.model';
import { clientBrandRepository } from '@/data/repositories/client-brand.repository';
import { documentCompilerRepository } from '@/data/repositories/document-compiler.repository';
import { intentConfigRepository } from '@/data/repositories/intent-config.repository';
import { onboardingRepository } from '@/data/repositories/onboarding.repository';
import { scopeRoutingRepository } from '@/data/repositories/scope-routing.repository';
import { ROOT_SCOPE_ID, scopeRepository } from '@/data/repositories/scope.repository';

/**
 * `scopes.slug` es `varchar(120)`, igual que `scopes.name`, asi que un nombre
 * que cabe en el nombre no cabe necesariamente en el slug: el sufijo aleatorio
 * suma nueve caracteres, y para las partes el slug ademas antepone el nombre
 * del proyecto. Un nombre de producto de 119 caracteres --largo, pero real: los
 * catalogos de software y de equipamiento los tienen asi-- reventaba el insert
 * con `value too long for type character varying(120)`, y el recorrido moria
 * ahi sin poder guardar.
 *
 * Recortar el slug no pierde nada: es interno, no se muestra, y la unicidad la
 * garantiza el sufijo, no la parte legible.
 */
const SLUG_MAX_LENGTH = 120;
const SLUG_SUFFIX_LENGTH = 9;

function projectSlug(name: string): string {
  const normalized = normalizeScopeAlias(name).replace(/\s+/g, '-');
  const base = (normalized || 'proyecto')
    .slice(0, SLUG_MAX_LENGTH - SLUG_SUFFIX_LENGTH)
    .replace(/-+$/, '');
  return `${base || 'proyecto'}-${randomUUID().slice(0, 8)}`;
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

function readableGreeting(message: unknown): string | null {
  if (typeof message === 'string') return message;
  if (!message || typeof message !== 'object' || !('fragments' in message)) return null;
  const fragments = (message as { fragments?: unknown }).fragments;
  if (!Array.isArray(fragments)) return null;
  const text = fragments
    .filter((fragment): fragment is { type: 'text'; content: string } => (
      Boolean(fragment)
      && typeof fragment === 'object'
      && (fragment as { type?: unknown }).type === 'text'
      && typeof (fragment as { content?: unknown }).content === 'string'
    ))
    .map(fragment => fragment.content)
    .join('\n');
  return text || null;
}

interface ProposedNode {
  name: string;
  scope_type: string;
  parent_name: string | null;
  aliases?: string[];
}

export interface ProposedProject {
  name: string;
  partNames: string[];
}

export interface ProposedStructure {
  projectName: string;
  partNames: string[];
  projectNames: string[];
  /**
   * Cada desarrollo con sus partes, para que la persona pueda confirmarlos
   * todos. Antes solo se presentaba el primero: los demas se creaban con el
   * nombre que les hubiera puesto el modelo, sin que nadie pudiera corregirlo.
   * Confirmar la mitad no es confirmar.
   */
  projects: ProposedProject[];
  businessName: string | null;
}

export function proposedStructureFromRun(run: any): ProposedStructure | null {
  const nodes = Array.isArray(run?.proposed_tree)
    ? (run.proposed_tree as ProposedNode[]).filter(node => node?.name?.trim())
    : [];
  if (nodes.length === 0) return null;

  const parentNames = new Set(
    nodes.map(node => normalizeScopeAlias(node.parent_name || '')).filter(Boolean)
  );
  const project = nodes.find(node => (
    !node.parent_name && parentNames.has(normalizeScopeAlias(node.name))
  )) || nodes.find(node => !node.parent_name) || nodes[0];
  const projectKey = normalizeScopeAlias(project.name);
  // Solo lo que se vende por separado. Un hijo del proyecto puede ser una
  // amenidad o una etapa, y ofrecerlas como opciones de venta las convertiria
  // en alcances con alias propios.
  const parts = nodes
    .filter(node => (
      normalizeScopeAlias(node.parent_name || '') === projectKey
      && isSellableScopeType(node.scope_type)
    ))
    .map(node => node.name.trim());

  const roots = nodes.filter(node => !node.parent_name);
  const partsOf = (rootName: string) => {
    const key = normalizeScopeAlias(rootName);
    return Array.from(new Set(nodes
      .filter(node => (
        normalizeScopeAlias(node.parent_name || '') === key
        && isSellableScopeType(node.scope_type)
      ))
      .map(node => node.name.trim())));
  };

  return {
    projectName: project.name.trim(),
    partNames: Array.from(new Set(parts)),
    projectNames: roots.map(node => node.name.trim()),
    projects: roots.map(node => ({
      name: node.name.trim(),
      partNames: partsOf(node.name),
    })),
    businessName: typeof run?.stage_checkpoint?.business_name === 'string'
      ? run.stage_checkpoint.business_name.trim() || null
      : null,
  };
}

export class OnboardingService {
  async getState(adminId: string) {
    const [brand, projects, greetingIntent] = await Promise.all([
      clientBrandRepository.get(),
      scopeRepository.getScopes(),
      intentConfigRepository.getByName('saludo', ROOT_SCOPE_ID),
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
    const activeProjects = projects.filter(
      scope => scope.parent_id === ROOT_SCOPE_ID && scope.is_active
    );
    const greetingRows = greetingIntent
      ? await intentConfigRepository.getResponsesByIntentId(greetingIntent.id)
      : [];
    const currentGreeting = greetingRows
      .filter(row => row.is_active)
      .map(row => readableGreeting(row.message_text))
      .find(Boolean) || null;
    const structure = proposedStructureFromRun(run);
    const businessName = brand.business_name || structure?.businessName || '';
    return {
      session,
      run,
      brand,
      vocabulary,
      samples: toneSamples(session.answers.project_name || '', sampleValue),
      projects: activeProjects,
      proposedStructure: structure,
      currentGreeting,
      composedGreeting: composeBusinessGreeting(
        businessName,
        activeProjects.map(scope => scope.name),
        vocabulary
      ),
      processing: this.processingMessage(run, Boolean(session.answers.tone)),
    };
  }

  async startNew(adminId: string) {
    await onboardingRepository.abandonActive(adminId);
    return onboardingRepository.create(adminId);
  }

  /**
   * Deja el recorrido. `getState` levanta uno nuevo en la siguiente lectura, asi
   * que cancelar es empezar de cero.
   *
   * No borra lo que ya se creo. Si el cliente alcanzo a confirmar la estructura,
   * sus proyectos ya existen y pueden tener contenido, leads o citas colgando;
   * la pantalla se lo dice antes de cancelar. Borrar en cascada desde un boton
   * de "cancelar" es una operacion destructiva disfrazada de escotilla.
   */
  async cancel(adminId: string) {
    const session = await onboardingRepository.getLatest(adminId);
    if (!session || session.status !== 'in_progress') return session;
    await onboardingRepository.abandonActive(adminId);
    return onboardingRepository.getById(session.id);
  }

  async chooseManualSetup(adminId: string) {
    const session = await this.requireActiveSession(adminId);
    return onboardingRepository.update(session.id, {
      step: 2,
      answers: mergeAnswers(session.answers, { manual_setup: true }),
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

  async saveIdentity(adminId: string, values: {
    businessName: string;
    singular: string;
    plural: string;
    greetingChoice: 'keep' | 'composed';
  }) {
    const session = await this.requireActiveSession(adminId);
    const businessName = values.businessName.trim();
    await Promise.all([
      clientBrandRepository.update({
        businessName,
        projectSingular: normalizeVocabulary(values.singular, 'desarrollo'),
        projectPlural: normalizeVocabulary(values.plural, 'desarrollos'),
        configured: true,
        useComposedGreeting: values.greetingChoice === 'composed',
      }),
      scopeRepository.rename(ROOT_SCOPE_ID, businessName),
    ]);
    return onboardingRepository.update(session.id, {
      step: 5,
      answers: mergeAnswers(session.answers, {
        business_name: businessName,
        vocabulary: true,
        greeting_choice: values.greetingChoice,
      }),
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
    if (session.run_id) {
      const run = await documentCompilerRepository.getRun(session.run_id);
      const facts = await documentCompilerRepository.getFacts(run.id);
      await documentCompilerRepository.assignRunToStructure(
        run.id,
        scope.id,
        new Map(facts.map(fact => [fact.id, scope.id]))
      );
      if (run.current_stage === 'tree') {
        await documentCompilerRepository.approveTree(run.id, adminId);
      }
    }
    return onboardingRepository.update(session.id, {
      step: 3,
      scopeId: scope.id,
      answers: mergeAnswers(session.answers, {
        project_name: name,
        aliases: aliases.map(item => item.alias),
      }),
    });
  }

  async confirmProposedStructure(adminId: string, values: {
    projectName: string;
    partNames: string[];
    flatten: boolean;
    projects?: Array<{ name: string; partNames: string[] }>;
  }) {
    const session = await this.requireActiveSession(adminId);
    if (!session.run_id) throw new Error('Primero agrega el material');
    if (session.scope_id) return session;
    const run = await documentCompilerRepository.getRun(session.run_id);
    if (run.current_stage !== 'tree') {
      throw new Error('El material todavía no está listo para confirmar');
    }

    const projectName = values.projectName.trim();
    const proposedNodes = (Array.isArray(run.proposed_tree) ? run.proposed_tree : [])
      .filter((node: ProposedNode) => (
        node?.name?.trim() && (!node.parent_name || isSellableScopeType(node.scope_type))
      ));
    const roots = proposedNodes.filter((node: ProposedNode) => !node.parent_name);

    // Lo que confirma la persona, un desarrollo por fila. Si solo llega el
    // nombre principal --el contrato anterior-- se aplica al primero y los
    // demas conservan lo que propuso el modelo.
    const confirmed = values.projects?.length
      ? values.projects
      : [{ name: projectName, partNames: values.partNames }];

    const nodes = proposedNodes.map((node: ProposedNode) => ({ ...node }));
    roots.forEach((root: ProposedNode, index: number) => {
      const answer = confirmed[index];
      if (!answer?.name?.trim()) return;
      const nextName = answer.name.trim();
      const previousName = root.name;
      for (const node of nodes) {
        if (node.name === previousName && !node.parent_name) node.name = nextName;
        if (node.parent_name === previousName) node.parent_name = nextName;
      }
    });

    if (values.flatten) {
      const firstName = confirmed[0]?.name?.trim() || projectName;
      for (let index = nodes.length - 1; index >= 0; index -= 1) {
        if (nodes[index].parent_name === firstName) nodes.splice(index, 1);
      }
    } else {
      confirmed.forEach(answer => {
        const rootName = answer?.name?.trim();
        if (!rootName) return;
        const partNames = Array.from(new Set(
          (answer.partNames || []).map(name => name.trim()).filter(Boolean)
        ));
        const proposedParts = nodes.filter((node: ProposedNode) => (
          node.parent_name === rootName && isSellableScopeType(node.scope_type)
        ));
        proposedParts.forEach((node: ProposedNode, index: number) => {
          if (partNames[index]) node.name = partNames[index];
        });
      });
    }

    // El alta no es atomica: son varios inserts sin transaccion. Si uno falla a
    // media lista, lo ya creado se queda, y el reintento del cliente vuelve a
    // crearlo todo desde cero. Asi aparecieron cuatro proyectos con el mismo
    // nombre en una prueba: un nombre de parte demasiado largo reventaba el
    // insert despues de haber creado el proyecto, cuatro veces seguidas.
    //
    // Deshacer lo creado en el mismo intento devuelve el arbol a como estaba.
    // Es seguro porque nada alcanzo a colgar de esos alcances todavia, y si
    // algo colgara el borrado fallaria en vez de arrastrarlo.
    const created: string[] = [];
    const rollback = async () => {
      for (const scopeId of created.reverse()) {
        try {
          await scopeRepository.deleteEmpty(scopeId);
        } catch (cleanupError) {
          console.error('No fue posible deshacer el alcance', scopeId, cleanupError);
        }
      }
    };

    const scopeByName = new Map<string, string>();
    let firstProjectId: string | null = null;
    try {
      const pending = [...nodes];
      while (pending.length > 0) {
        const creatableIndex = pending.findIndex((node: ProposedNode) => (
          !node.parent_name || scopeByName.has(normalizeScopeAlias(node.parent_name))
        ));
        if (creatableIndex < 0) throw new Error('La estructura propuesta contiene un padre que no existe');
        const [node] = pending.splice(creatableIndex, 1);
        const parentId = node.parent_name
          ? scopeByName.get(normalizeScopeAlias(node.parent_name))!
          : ROOT_SCOPE_ID;
        const aliases = uniqueAliases([
          node.name,
          shortScopeAlias(node.name) || '',
          ...(node.aliases || []),
        ]);
        const scope = await scopeRepository.create({
          name: node.name.trim(),
          slug: projectSlug(`${node.parent_name || ''}-${node.name}`),
          parent_id: parentId,
          scope_type: node.scope_type === 'opcion' ? 'model' : 'development',
          is_active: false,
          metadata: {
            compiler_run_id: run.id,
            compiler_aliases: aliases.map(item => item.alias),
          },
        });
        created.push(scope.id);
        if (!node.parent_name && !firstProjectId) firstProjectId = scope.id;
        for (const alias of aliases) scopeByName.set(alias.normalizedAlias, scope.id);
      }
    } catch (error) {
      await rollback();
      throw error;
    }

    const facts = await documentCompilerRepository.getFacts(run.id);
    const scopeEntries = Array.from(scopeByName.entries())
      .sort(([left], [right]) => right.length - left.length);

    // Un hecho sin sujeto no dice de quien habla, pero el archivo del que salio
    // si: el cliente sube el material de cada desarrollo, y ese material es la
    // afirmacion de a quien pertenece lo que dice. Si el archivo nombra un solo
    // desarrollo, sus hechos sin sujeto son de ese desarrollo.
    const materialScope = await this.branchByMaterial(run, nodes, scopeByName);
    const factScopeById = new Map<string, string>();
    for (const fact of facts) {
      const subject = normalizeScopeAlias(fact.subject || '');
      const paddedSubject = ` ${subject} `;
      const matchedScope = subject
        ? scopeEntries.find(([name]) => (
            subject === name || paddedSubject.includes(` ${name} `)
          ))?.[1]
        : undefined;
      // Sin sujeto ni procedencia, el hecho se queda en el negocio. Antes caia
      // en `firstProjectId` --el primer proyecto de la lista, por estar
      // primero--: en la corrida de FYMSA eso metio dentro de Europa los 18
      // hechos sin sujeto del folleto de Altabrisa, su direccion incluida.
      // "No se" tiene que llevar a la raiz, nunca a una pertenencia inventada.
      factScopeById.set(
        fact.id,
        matchedScope || materialScope.get(fact.material_id) || ROOT_SCOPE_ID
      );
    }
    await documentCompilerRepository.assignFactsToStructure(run.id, factScopeById);
    await documentCompilerRepository.approveTree(run.id, adminId);
    await this.adoptBusinessName(run);

    const projectNames = nodes.filter((node: ProposedNode) => !node.parent_name).map((node: ProposedNode) => node.name);
    const firstProjectParts = nodes
      .filter((node: ProposedNode) => node.parent_name === projectName && isSellableScopeType(node.scope_type))
      .map((node: ProposedNode) => node.name);

    return onboardingRepository.update(session.id, {
      step: 3,
      scopeId: firstProjectId,
      answers: mergeAnswers(session.answers, {
        project_name: projectName,
        aliases: projectNames,
        part_names: firstProjectParts,
      }),
    });
  }

  /**
   * A que rama pertenece cada material, cuando se puede saber sin ambiguedad.
   *
   * Se mira el nombre del archivo y su texto: si ahi aparece el nombre --o un
   * alias-- de exactamente un desarrollo, el material es de ese desarrollo. Si
   * aparecen varios, o ninguno, el material no decide y sus hechos sin sujeto
   * se quedan en el negocio.
   *
   * Es deterministico y no consulta al modelo: la procedencia ya esta guardada.
   */
  private async branchByMaterial(
    run: { id: string; material_ids?: string[] },
    nodes: ProposedNode[],
    scopeByName: Map<string, string>
  ): Promise<Map<string, string>> {
    const byMaterial = new Map<string, string>();
    const materialIds = run.material_ids || [];
    if (materialIds.length === 0) return byMaterial;

    const branchNames = nodes
      .filter(node => !node.parent_name)
      .map(node => ({
        aliases: uniqueAliases([node.name, ...(node.aliases || [])])
          .map(alias => alias.normalizedAlias)
          .filter(Boolean),
        scopeId: scopeByName.get(normalizeScopeAlias(node.name)),
      }))
      .filter((branch): branch is { aliases: string[]; scopeId: string } => Boolean(branch.scopeId));
    if (branchNames.length < 2) return byMaterial;

    const materials = await documentCompilerRepository.getMaterials(materialIds);
    for (const material of materials) {
      // El nombre del archivo cuenta tanto como el texto: un PDF que no se pudo
      // leer como texto sigue llamandose `fymsa-altabrisa.pdf`.
      const haystack = ` ${normalizeScopeAlias(
        `${material.original_filename || ''} ${material.plain_text || ''}`.replace(/[^0-9a-zA-Z\u00C0-\u024F]+/g, ' ')
      )} `;
      const named = branchNames.filter(branch =>
        branch.aliases.some(alias => haystack.includes(` ${alias} `))
      );
      if (named.length === 1) byMaterial.set(material.id, named[0].scopeId);
    }
    return byMaterial;
  }

  /**
   * La raiz es el negocio, no un desarrollo. El alcance raiz nace sembrado con
   * el nombre del primer cliente --`Europa`-- y nada lo cambiaba: al compilar
   * material de FYMSA el arbol quedaba con `Europa` como negocio y `Residencial
   * Europa` colgando de si mismo, y el saludo perdia el nombre del cliente
   * porque `client_brand_config.business_name` seguia vacio.
   *
   * El material si trae el nombre; el compilador ya lo extrae. Aqui se adopta,
   * con la misma regla que el resto del contenido: sustituir es quedarse con lo
   * que dice el material, y anadir no toca lo que ya estaba. Renombrar la raiz
   * no mueve contenido, solo como se llama el negocio en el arbol y el saludo.
   *
   * La eleccion de saludo si es de la persona: solo se enciende el saludo
   * compuesto la primera vez, cuando todavia no habia nombre que componer.
   */
  private async adoptBusinessName(run: { stage_checkpoint?: any; replacement_mode?: string }) {
    const detected = typeof run?.stage_checkpoint?.business_name === 'string'
      ? run.stage_checkpoint.business_name.trim()
      : '';
    if (!detected) return;
    const brand = await clientBrandRepository.get();
    const previous = brand.business_name?.trim() || '';
    if (previous && run.replacement_mode === 'add') return;
    await Promise.all([
      clientBrandRepository.update({
        businessName: detected,
        ...(previous ? {} : { useComposedGreeting: true }),
      }),
      scopeRepository.rename(ROOT_SCOPE_ID, detected),
    ]);
  }

  async saveVisitFlow(adminId: string, values: {
    choice: 'decided' | 'guided' | 'unsure';
    partNames: string[];
  }) {
    const session = await this.requireActiveSession(adminId);
    if (!session.scope_id) throw new Error('Primero agrega el proyecto');
    if (session.answers.visit_flow) return session;

    const existingPartNames = session.answers.part_names || [];
    const partNames = values.choice === 'decided' && existingPartNames.length === 0
      ? values.partNames.map(name => name.trim()).filter(Boolean)
      : existingPartNames;
    for (const name of existingPartNames.length === 0 ? partNames : []) {
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
      step: 6,
      answers: mergeAnswers(session.answers, { goal_confirmed: true }),
    });
  }

  async attachRun(adminId: string, runId: string) {
    const session = await this.requireActiveSession(adminId);
    return onboardingRepository.update(session.id, {
      step: 2,
      runId,
      answers: mergeAnswers(session.answers, { material_received: true }),
    });
  }

  async saveTone(adminId: string, tone: BrandTone) {
    const session = await this.requireActiveSession(adminId);
    await clientBrandRepository.update({ tone, configured: true });
    const values = {
      answers: mergeAnswers(session.answers, { tone }),
      ...(!session.run_id ? {
        step: 7,
        status: 'completed' as const,
        completedAt: new Date().toISOString(),
      } : {}),
    };
    return onboardingRepository.update(session.id, values);
  }

  async advance(adminId: string) {
    const session = await this.requireActiveSession(adminId);
    if (!session.run_id) return session;
    let run = await documentCompilerRepository.getRun(session.run_id);

    if (run.current_stage === 'tree') {
      return session;
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
    if (run.current_stage === 'tree') {
      return {
        kind: 'decision',
        title: 'Encontramos cómo está organizado tu material',
        detail: 'Confirma los nombres antes de preparar las respuestas.',
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
      detail: 'Esto puede tardar unos minutos. Mantén esta pantalla abierta mientras leemos el material y organizamos las respuestas.',
    };
  }
}

export const onboardingService = new OnboardingService();
