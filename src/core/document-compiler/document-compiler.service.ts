import { z } from 'zod';
import type { ResponseInputContent } from 'openai/resources/responses/responses';
import {
  catalogLeadPhrases,
  catalogTermsFromFacts,
  checkBranchesNamed,
  checkOfferDeclared,
  consolidateFacts,
  changedFactFingerprints,
  deriveCoverage,
  factFingerprint,
  groupFactsByDestination,
  keyMatchesAlias,
  mergeCandidates,
  normalizeFactKey,
  REAL_ESTATE_PRESET,
  reviewSignalsForFacts,
  sharedFactsForAncestor,
  vocabularyReachesQuestion,
  vocabularyRegression,
} from '@/core/document-compiler/compiler-rules';
import {
  SCOPE_TYPE_VALUES,
  type CandidateQuestion,
  type ExtractedFact,
  type MatcherPatterns,
} from '@/data/models/document-compiler.model';
import { documentCompilerRepository } from '@/data/repositories/document-compiler.repository';
import { getAiModel, getOpenAIClient } from '@/services/ai/openai.service';
import { getCompilerMaterialModelSource } from '@/services/storage/compiler-material-storage';
import { clientBrandRepository } from '@/data/repositories/client-brand.repository';
import { toClientVocabulary, toneInstruction } from '@/core/onboarding/client-vocabulary';
import { scopeRepository } from '@/data/repositories/scope.repository';

const VOCABULARY_GENERATION_VERSION = 7;

const extractionSchema = z.object({
  facts: z.array(z.object({
    material_id: z.string().uuid(),
    key: z.string().min(1),
    subject: z.string().nullable().optional(),
    value: z.unknown(),
    type: z.enum(['text', 'money', 'date', 'contractual', 'number', 'location']).default('text'),
    page: z.number().int().positive().nullable().optional(),
    provenance_confidence: z.number().min(0).max(1).default(1),
  })),
  candidate_questions: z.array(z.object({
    intent_name: z.string().min(1),
    question: z.string().min(1),
    fact_keys: z.array(z.string().min(1)),
  })).default([]),
  business_name: z.string().min(1).nullable().default(null),
  proposed_tree: z.array(z.object({
    name: z.string().min(1),
    scope_type: z.enum(SCOPE_TYPE_VALUES),
    parent_name: z.string().nullable().default(null),
    aliases: z.array(z.string().min(1)).default([]),
  })).default([]),
});

// La forma la garantiza el proveedor, no una comprobacion posterior.
// Con json_object el modelo devuelve JSON valido pero de la forma que quiera:
// la primera ejecucion real contra un PDF devolvio proposed_tree como objeto y
// candidate_questions con otros campos, y zod tumbo la ejecucion entera sin
// reintento. Con json_schema estricto esa clase de fallo desaparece en origen.
const EXTRACTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['facts', 'candidate_questions', 'business_name', 'proposed_tree'],
  properties: {
    facts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['material_id', 'key', 'subject', 'value', 'type', 'page', 'provenance_confidence'],
        properties: {
          material_id: { type: 'string' },
          key: { type: 'string' },
          subject: { type: ['string', 'null'] },
          value: { type: 'string' },
          type: { type: 'string', enum: ['text', 'money', 'date', 'contractual', 'number', 'location'] },
          page: { type: ['integer', 'null'] },
          provenance_confidence: { type: 'number' },
        },
      },
    },
    candidate_questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['intent_name', 'question', 'fact_keys'],
        properties: {
          intent_name: { type: 'string' },
          question: { type: 'string' },
          fact_keys: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    business_name: { type: ['string', 'null'] },
    proposed_tree: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'scope_type', 'parent_name', 'aliases'],
        properties: {
          name: { type: 'string' },
          scope_type: { type: 'string', enum: SCOPE_TYPE_VALUES as unknown as string[] },
          parent_name: { type: ['string', 'null'] },
          aliases: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
} as const;

const WRITING_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['proposals'],
  properties: {
    proposals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['proposal_key', 'intent_name', 'response', 'keywords', 'synonyms', 'typos', 'phrases', 'question_variants', 'offers_intent_name'],
        properties: {
          proposal_key: { type: 'string' },
          intent_name: { type: 'string' },
          response: { type: 'string' },
          keywords: { type: 'array', minItems: 2, items: { type: 'string' } },
          synonyms: { type: 'array', minItems: 2, items: { type: 'string' } },
          typos: { type: 'array', minItems: 1, items: { type: 'string' } },
          phrases: { type: 'array', minItems: 3, items: { type: 'string' } },
          question_variants: { type: 'array', minItems: 2, items: { type: 'string' } },
          offers_intent_name: { type: ['string', 'null'] },
        },
      },
    },
  },
} as const;

const writingSchema = z.object({
  proposals: z.array(z.object({
    proposal_key: z.string(),
    intent_name: z.string(),
    response: z.string().min(1),
    keywords: z.array(z.string().min(1)).min(2),
    synonyms: z.array(z.string().min(1)).min(2),
    typos: z.array(z.string().min(1)).min(1),
    phrases: z.array(z.string().min(1)).min(3),
    question_variants: z.array(z.string().min(1)).min(2),
    offers_intent_name: z.string().nullable(),
  })),
});

export class DocumentCompilerService {
  async runNextStage(runId: string) {
    const run = await documentCompilerRepository.getRun(runId);

    try {
      if (run.current_stage === 'extract_facts') return this.extractFacts(run);
      if (run.current_stage === 'consolidate_facts') return this.consolidate(run);
      if (run.current_stage === 'tree') {
        return documentCompilerRepository.advanceRun(run.id, {
          status: 'waiting_tree_approval',
        });
      }
      if (run.current_stage === 'catalog') return this.buildCatalog(run);
      if (run.current_stage === 'content') return this.generateContent(run);
      return run;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido durante la compilación';
      await documentCompilerRepository.advanceRun(run.id, { status: 'failed', last_error: message });
      throw error;
    }
  }

  private async extractFacts(run: any) {
    const materials = await documentCompilerRepository.getMaterials(run.material_ids);
    const content: ResponseInputContent[] = [{
      type: 'input_text',
      text: this.extractionPrompt(materials.map(material => ({
        id: material.id,
        filename: material.original_filename,
      }))),
    }];

    for (const material of materials) {
      if (material.material_kind === 'text') {
        content.push({
          type: 'input_text',
          text: `MATERIAL ${material.id} (${material.original_filename}):\n${material.plain_text}`,
        });
        continue;
      }

      try {
        const fileSource = await getCompilerMaterialModelSource(
          material.storage_path,
          material.mime_type
        );
        content.push({
          type: 'input_file',
          ...fileSource,
          filename: material.original_filename,
        });
      } catch (error) {
        await documentCompilerRepository.updateMaterial(material.id, {
          reading_status: 'failed',
          reading_error: error instanceof Error ? error.message : 'No fue posible abrir el archivo conservado',
        });
        throw error;
      }
    }

    const [openai, model] = await Promise.all([
      getOpenAIClient(),
      getAiModel('extraction'),
    ]);
    const response = await openai.responses.create({
      model,
      input: [{ role: 'user', content }],
      store: false,
      text: {
        format: {
          type: 'json_schema',
          name: 'compiler_extraction',
          strict: true,
          schema: EXTRACTION_JSON_SCHEMA as unknown as Record<string, unknown>,
        },
      },
    });
    const parsed = extractionSchema.parse(JSON.parse(response.output_text));

    const facts: ExtractedFact[] = parsed.facts.flatMap(fact => {
      if (!fact.page) return [];
      return [{
        materialId: fact.material_id,
        scopeId: run.scope_id,
        key: fact.key.trim().toLowerCase(),
        subject: fact.subject ?? null,
        value: fact.value,
        type: fact.type,
        page: fact.page,
        provenanceConfidence: fact.provenance_confidence,
        fingerprint: factFingerprint(fact.key, fact.value, fact.subject),
      }];
    });
    const knownMaterialIds = new Set(materials.map(material => material.id));
    const attributableFacts = facts.filter(fact => knownMaterialIds.has(fact.materialId));

    if (attributableFacts.length === 0) {
      await Promise.all(materials.map(material =>
        documentCompilerRepository.updateMaterial(material.id, {
          reading_status: 'unreadable',
          reading_error: 'El material se procesó, pero no produjo hechos verificables',
        })
      ));
      throw new Error('El material no produjo hechos verificables; revisa si es legible');
    }

    const unreadableMaterials = materials.filter(material => (
      !attributableFacts.some(fact => fact.materialId === material.id)
    ));
    if (unreadableMaterials.length > 0) {
      await Promise.all(unreadableMaterials.map(material =>
        documentCompilerRepository.updateMaterial(material.id, {
          reading_status: 'unreadable',
          reading_error: 'Este material no produjo hechos verificables',
        })
      ));
      throw new Error(
        `No se pudo leer: ${unreadableMaterials.map(material => material.original_filename).join(', ')}`
      );
    }

    await documentCompilerRepository.replaceFacts(run.id, attributableFacts);
    await Promise.all(materials.map(material => {
      const producedFacts = attributableFacts.some(fact => fact.materialId === material.id);
      return documentCompilerRepository.updateMaterial(material.id, {
        reading_status: producedFacts ? 'ready' : 'unreadable',
        reading_error: producedFacts ? null : 'Este material no produjo hechos verificables',
      });
    }));
    return documentCompilerRepository.advanceRun(run.id, {
      status: 'running',
      current_stage: 'consolidate_facts',
      stage_checkpoint: {
        candidate_questions: parsed.candidate_questions,
        business_name: parsed.business_name,
        proposed_tree: parsed.proposed_tree,
      },
      proposed_tree: parsed.proposed_tree,
      last_error: null,
    });
  }

  private async consolidate(run: any) {
    const storedFacts = await documentCompilerRepository.getFacts(run.id);
    const facts: ExtractedFact[] = storedFacts.map(row => ({
      id: row.id,
      materialId: row.material_id,
      scopeId: row.scope_id,
      key: row.fact_key,
      subject: row.subject,
      value: row.fact_value,
      type: row.fact_type,
      page: row.page_number,
      provenanceConfidence: Number(row.provenance_confidence),
      fingerprint: row.fingerprint,
      contradictory: row.is_contradictory,
    }));
    await documentCompilerRepository.replaceFacts(run.id, consolidateFacts(facts));
    const siblingContext = await documentCompilerRepository.getSiblingFactSets(run.scope_id, run.id);
    if (siblingContext) {
      const factsByChild = new Map(
        Array.from(siblingContext.sets.entries()).map(([scopeId, rows]) => [
          scopeId,
          rows.map(row => this.toFact(row)),
        ])
      );
      const shared = sharedFactsForAncestor(factsByChild);
      const sharedFingerprints = new Set(shared.map(fact => fact.fingerprint));
      const factIds = Array.from(siblingContext.sets.values())
        .flat()
        .filter(row => sharedFingerprints.has(row.fingerprint))
        .map(row => row.id);
      await documentCompilerRepository.promoteFacts(factIds, siblingContext.parentId);
    }
    return documentCompilerRepository.advanceRun(run.id, {
      current_stage: 'tree',
      status: 'waiting_tree_approval',
    });
  }

  private async buildCatalog(run: any) {
    if (!run.tree_approved_at) throw new Error('La estructura debe aprobarse antes de generar contenido');
    const storedFacts = await documentCompilerRepository.getFacts(run.id);
    const facts = storedFacts.map(row => this.toFact(row));
    const materialCandidates: CandidateQuestion[] = (
      run.stage_checkpoint?.candidate_questions || []
    ).map((candidate: any) => ({
      intentName: candidate.intent_name,
      question: candidate.question,
      source: 'material' as const,
      factKeys: candidate.fact_keys,
    }));

    const scopes = await scopeRepository.getScopes();
    const scopesById = new Map(scopes.map((scope: any) => [scope.id, scope]));
    const belongsToRunScope = (scopeId: string) => {
      let current: any = scopesById.get(scopeId);
      while (current) {
        if (current.id === run.scope_id) return true;
        current = current.parent_id ? scopesById.get(current.parent_id) : null;
      }
      return false;
    };
    const optionScopeIds = new Set(scopes
      .filter((scope: any) => scope.scope_type === 'model' && belongsToRunScope(scope.id))
      .map((scope: any) => scope.id));
    const catalogFacts = facts.filter(fact => (
      optionScopeIds.has(fact.scopeId)
      || catalogLeadPhrases([fact]).length > 0
    ));
    if (catalogFacts.length > 0) {
      materialCandidates.push({
        intentName: 'modelo',
        question: '¿Qué opciones hay?',
        source: 'material',
        factKeys: Array.from(new Set(catalogFacts.map(fact => fact.key))),
      });
    }

    const coverage = deriveCoverage(
      facts,
      mergeCandidates(REAL_ESTATE_PRESET, materialCandidates)
    );
    await documentCompilerRepository.replaceCoverage(run.id, coverage.map(row => ({
      run_id: run.id,
      scope_id: run.scope_id,
      intent_name: row.intentName,
      question: row.question,
      status: row.status,
      fact_ids: row.factIds,
      source: row.source,
    })));
    return documentCompilerRepository.advanceRun(run.id, { current_stage: 'content' });
  }

  private async generateContent(run: any) {
    if (!run.tree_approved_at) throw new Error('La estructura debe aprobarse antes de generar contenido');
    const review = await documentCompilerRepository.getReview(run.id);
    let covered = review.coverage.filter((row: any) => row.status === 'covered');
    const [intents, scopes] = await Promise.all([
      documentCompilerRepository.getAllIntents(),
      scopeRepository.getScopes(),
    ]);
    const facts = review.facts.map((row: any) => this.toFact(row));
    let changedKeys: Set<string> | null = null;
    let previousProposals: any[] = [];
    if (run.previous_run_id) {
      const previous = await documentCompilerRepository.getRecompileContext(run.previous_run_id);
      const previousFacts = previous.facts.map(row => this.toFact(row));
      changedKeys = changedFactFingerprints(previousFacts, facts);
      previousProposals = previous.proposals;
      const vocabularyNeedsRegeneration = previousProposals.some(proposal =>
        proposal.is_publishable === false
        || proposal.review_details?.vocabulary_version !== VOCABULARY_GENERATION_VERSION
      );
      if (!vocabularyNeedsRegeneration) {
        covered = covered.filter((coverage: any) =>
          facts.some(fact => coverage.fact_ids.includes(fact.id) && changedKeys!.has(fact.key))
        );
      }

      const currentKeys = new Set(facts.map(fact => fact.key));
      const disappearedFacts = previousFacts.filter(fact => !currentKeys.has(fact.key));
      await documentCompilerRepository.flagUnsupportedResponsesForFacts(
        disappearedFacts.flatMap(fact => fact.id ? [fact.id] : [])
      );
    }

    const writingTargets = covered.flatMap((coverage: any) => {
      let supportingFacts = facts.filter(fact => coverage.fact_ids.includes(fact.id));
      if (coverage.intent_name === 'precio') {
        const priceAliases = REAL_ESTATE_PRESET.find(item => item.intentName === 'precio')!.factKeys;
        supportingFacts = supportingFacts.filter(fact => (
          priceAliases.some(alias => keyMatchesAlias(fact.key, alias))
        ));
      }
      const groups = groupFactsByDestination(supportingFacts, run.scope_id, scopes);
      const targets = groups.map(group => ({
        proposalKey: `${coverage.id}:${group.scopeId}`,
        coverage,
        scopeId: group.scopeId,
        facts: group.facts,
        extraPhrases: [] as string[],
        excludedTerms: [] as string[],
      }));

      // El catalogo describe el conjunto completo, no cada opcion aislada.
      // Sus dependencias siguen siendo los hechos que sustentan esas opciones.
      if (coverage.intent_name === 'modelo') {
        const optionScopeIds = new Set(scopes
          .filter((scope: any) => scope.scope_type === 'model')
          .map((scope: any) => scope.id));
        const catalogFacts = supportingFacts.filter(fact => (
          optionScopeIds.has(fact.scopeId)
          || catalogLeadPhrases([fact]).length > 0
        ));
        const optionNames = scopes
          .filter((scope: any) => optionScopeIds.has(scope.id))
          .flatMap((scope: any) => [
            scope.name,
            ...((scope.metadata?.compiler_aliases || []) as string[]),
          ]);
        return [{
          proposalKey: `${coverage.id}:${run.scope_id}:catalog`,
          coverage,
          scopeId: run.scope_id,
          facts: catalogFacts,
          extraPhrases: catalogLeadPhrases(catalogFacts),
          excludedTerms: optionNames,
        }];
      }

      // Una pregunta sin foco se resuelve en la raiz. Los precios detallados
      // siguen viviendo en cada opcion para que "precio de X" sea exacto.
      if (
        coverage.intent_name === 'precio'
        && supportingFacts.length > 0
        && !groups.some(group => group.scopeId === run.scope_id)
      ) {
        targets.push({
          proposalKey: `${coverage.id}:${run.scope_id}:overview`,
          coverage,
          scopeId: run.scope_id,
          facts: supportingFacts,
          extraPhrases: [],
          excludedTerms: [
            ...catalogTermsFromFacts(facts),
            ...scopes
              .filter((scope: any) => scope.scope_type === 'model')
              .flatMap((scope: any) => [
                scope.name,
                ...((scope.metadata?.compiler_aliases || []) as string[]),
              ]),
          ],
        });
      }

      return targets;
    });

    const [openai, model, brand] = await Promise.all([
      getOpenAIClient(),
      getAiModel('writing'),
      clientBrandRepository.get(),
    ]);
    const vocabulary = toClientVocabulary(brand);
    const brandInstruction = brand.is_configured
      ? `${toneInstruction(brand.tone)} Llama a los proyectos "${vocabulary.plural}" y a uno solo "${vocabulary.singular}".`
      : '';
    const response = await openai.responses.create({
      model,
      store: false,
      input: `Redacta exactamente una respuesta breve de WhatsApp por cada objetivo usando exclusivamente sus hechos. Conserva proposal_key e intent_name literalmente. No combines objetivos, no inventes, no invites a agendar una cita y no uses emojis. ${brandInstruction} Para cada objetivo genera tambien el vocabulario con el que un lead preguntaria eso por WhatsApp. Las palabras deben salir de los hechos y del material de este cliente: no uses una lista fija del sector. keywords lleva al menos 2 palabras principales, synonyms al menos 2 formas equivalentes, typos al menos 1 errata probable y phrases al menos 3 preguntas completas y naturales. question_variants lleva 2 reformulaciones breves que funcionen como mensaje autonomo, sin nombre de empresa, desarrollo, modelo ni producto concreto; por ejemplo, para una pregunta de precio una variante seria "cuanto cuesta" y no "cuanto cuesta el modelo X". El nombre intent_name no cuenta como vocabulario y no debes copiarlo para completar listas. Evita terminar la respuesta en una pregunta de si o no salvo que sea necesario invitar a algo (ver planos, agendar, mostrar mas detalle); si lo haces, offers_intent_name debe llevar el intent_name de lo que le ofreces al lead (uno de los objetivos de esta misma lista, o el mismo intent_name si ofreces un nivel siguiente de el mismo). Si la respuesta no termina en pregunta de si o no, offers_intent_name debe ir null. Devuelve JSON con {"proposals":[{"proposal_key":"...","intent_name":"...","response":"...","keywords":["..."],"synonyms":["..."],"typos":["..."],"phrases":["..."],"question_variants":["..."],"offers_intent_name":null}]}.\n\nObjetivos: ${JSON.stringify(writingTargets.map(target => ({ proposal_key: target.proposalKey, intent_name: target.coverage.intent_name, question: target.coverage.question, scope_id: target.scopeId, facts: target.facts.map(fact => ({ id: fact.id, key: fact.key, subject: fact.subject, value: fact.value })) })))}`,
      text: {
        format: {
          type: 'json_schema',
          name: 'compiler_writing',
          strict: true,
          schema: WRITING_JSON_SCHEMA as unknown as Record<string, unknown>,
        },
      },
    });
    const generated = writingSchema.parse(JSON.parse(response.output_text));
    const generatedByKey = new Map(generated.proposals.map(item => [item.proposal_key, item]));
    const proposals = [];
    const placementErrors = new Map<string, string[]>();

    for (const target of writingTargets) {
      const proposal = generatedByKey.get(target.proposalKey);
      if (!proposal) {
        const errors = placementErrors.get(target.coverage.id) || [];
        errors.push(`No se generó contenido para el alcance ${target.scopeId}`);
        placementErrors.set(target.coverage.id, errors);
        continue;
      }

      const intentsWithName = intents.filter((intent: any) =>
        intent.intent_name === target.coverage.intent_name
      );
      const exactIntent: any = intentsWithName.find((intent: any) =>
        intent.scope_id === target.scopeId
      );
      // Solo una intencion encendida puede prestar sus ajustes por herencia:
      // la que espera aprobacion todavia no rige en ningun alcance.
      const [visibleIntent] = await scopeRepository.resolveRows(
        intentsWithName.filter((intent: any) => intent.is_active),
        target.scopeId,
        (intent: any) => intent.intent_name
      );
      const template: any = exactIntent || visibleIntent;
      const previousProposal = previousProposals.find(item => item.intent_id === exactIntent?.id);
      const excludedTerms = target.excludedTerms
        .map(term => normalizeFactKey(term))
        .filter(Boolean);
      const keepVocabulary = (value: string) => {
        const normalized = normalizeFactKey(value);
        return !excludedTerms.some(term => (
          normalized === term
          || normalized.startsWith(`${term}_`)
          || normalized.endsWith(`_${term}`)
          || normalized.includes(`_${term}_`)
        ));
      };
      const matcherPatterns: MatcherPatterns = {
        keywords: Array.from(new Set(proposal.keywords.filter(keepVocabulary))),
        synonyms: Array.from(new Set(proposal.synonyms.filter(keepVocabulary))),
        typos: Array.from(new Set(proposal.typos.filter(keepVocabulary))),
        phrases: Array.from(new Set([
          ...proposal.phrases,
          ...proposal.question_variants,
          ...target.extraPhrases,
        ].filter(keepVocabulary))),
      };
      const vocabularyCheck = vocabularyReachesQuestion(
        matcherPatterns,
        target.coverage.question,
        proposal.question_variants
      );
      const previousPatterns: MatcherPatterns = {
        keywords: template?.keywords || [],
        synonyms: template?.synonyms || [],
        typos: template?.typos || [],
        phrases: template?.phrases || [],
      };
      const regression = vocabularyRegression(matcherPatterns, previousPatterns);
      const signals = reviewSignalsForFacts(target.facts, {
        changed: Boolean(changedKeys),
        humanEdited: previousProposal?.edited_by_human || false,
      });
      if (vocabularyCheck.missed.length > 0) signals.push('poor_vocabulary');
      if (regression.missed.length > 0) signals.push('vocabulary_regression');

      // Una respuesta de si/no sin oferta declarada es un callejon: el
      // afirmativo del lead no tiene contra que resolverse.
      const offerReason = checkOfferDeclared(proposal.response, proposal.offers_intent_name);
      let offerTargetMissing: string | null = null;
      if (!offerReason && proposal.offers_intent_name) {
        const knownIntentNames = new Set([
          ...writingTargets.map(item => item.coverage.intent_name),
          ...intents.map((intent: any) => intent.intent_name),
        ]);
        if (!knownIntentNames.has(proposal.offers_intent_name)) {
          offerTargetMissing = `La oferta declarada ("${proposal.offers_intent_name}") no corresponde a ninguna pregunta que el material sostenga.`;
        }
      }

      // Una respuesta que reune datos de mas de una rama sin nombrarlas no es
      // una respuesta que el lead pueda usar.
      const factScopeIds = Array.from(new Set(target.facts.map(fact => fact.scopeId).filter(Boolean)));
      const branchIds = Array.from(new Set(
        (await Promise.all(factScopeIds.map(scopeId => scopeRepository.getBranchId(scopeId))))
          .filter((id): id is string => Boolean(id))
      ));
      const branchNames = branchIds
        .map(id => scopes.find((scope: any) => scope.id === id)?.name)
        .filter((name): name is string => Boolean(name));
      const branchReason = checkBranchesNamed(proposal.response, branchNames);

      if (offerReason || offerTargetMissing) signals.push('unoffered_yes_no');
      if (branchReason) signals.push('crosses_branches_unnamed');

      proposals.push({
        coverageId: target.coverage.id,
        scopeId: target.scopeId,
        intentId: exactIntent?.id || null,
        intentName: target.coverage.intent_name,
        displayName: template?.display_name || target.coverage.question,
        minConfidence: Number(template?.min_confidence ?? 0.6),
        priority: Number(template?.priority ?? 0),
        responseKey: `compiler_${target.coverage.intent_name}`,
        messageText: { fragments: [{ type: 'text' as const, content: proposal.response, delay: 0 }] },
        matcherPatterns,
        signals,
        offersIntentName: proposal.offers_intent_name || null,
        isPublishable: vocabularyCheck.missed.length === 0 && !offerReason && !offerTargetMissing && !branchReason,
        reviewDetails: {
          vocabulary_version: VOCABULARY_GENERATION_VERSION,
          vocabulary: {
            question: target.coverage.question,
            reached: vocabularyCheck.reached,
            missed: vocabularyCheck.missed,
          },
          regression: {
            reached: regression.reached,
            missed: regression.missed,
          },
          offer: (offerReason || offerTargetMissing) ? { reason: offerReason || offerTargetMissing } : undefined,
          branches: branchReason ? { reason: branchReason, names: branchNames } : undefined,
        },
        factIds: target.facts.flatMap(fact => fact.id ? [fact.id] : []),
      });
    }

    await Promise.all(covered.map((coverage: any) =>
      documentCompilerRepository.setCoveragePlacementError(
        coverage.id,
        placementErrors.get(coverage.id)?.join('. ') || null
      )
    ));

    await documentCompilerRepository.replaceProposals(run.id, proposals);
    return documentCompilerRepository.advanceRun(run.id, {
      current_stage: 'review',
      status: 'waiting_content_approval',
    });
  }

  private toFact(row: any): ExtractedFact {
    return {
      id: row.id,
      materialId: row.material_id,
      scopeId: row.scope_id,
      key: row.fact_key,
      subject: row.subject,
      value: row.fact_value,
      type: row.fact_type,
      page: row.page_number,
      provenanceConfidence: Number(row.provenance_confidence),
      fingerprint: row.fingerprint,
      contradictory: row.is_contradictory,
    };
  }

  private extractionPrompt(materials: Array<{ id: string; filename: string }>): string {
    return `Extrae hechos atómicos verificables de todo el material. Devuelve solo JSON con las claves facts, candidate_questions, business_name y proposed_tree. Cada hecho debe llevar material_id, key, subject, value, type (text, money, date, contractual, number o location), page y provenance_confidence.

subject dice de qué habla el hecho: el modelo, la etapa o la unidad concreta a la que se refiere. Úsalo siempre que el mismo dato exista para varias cosas, de modo que tres modelos con tres precios sean tres hechos con la misma key y distinto subject. Deja subject en null solo cuando el hecho sea del desarrollo entero.

Usa la misma key para el mismo tipo de dato en todo el material, y nómbrala en el idioma del documento. Descarta cualquier hecho cuya página no puedas atribuir. No resuelvas contradicciones ni elijas un valor: si el material afirma dos valores para el mismo subject, devuelve los dos. material_id debe ser uno de: ${JSON.stringify(materials)}. Las preguntas solo son candidatas; el preset nunca aporta hechos. business_name es la empresa que vende, solo cuando el material la identifica de forma explícita; no uses ahí el nombre del proyecto.

Conserva también el vocabulario comercial del material: por cada nombre genérico con el que el documento llama a algo que vende —por ejemplo casas, lotes de terreno, bodegas o consultorios— agrega un hecho separado con key producto_ofrecido y value igual a ese término, sin reemplazarlo por una palabra del sector.

proposed_tree describe únicamente estructura que el material sustenta y debe incluir todos los desarrollos de todos los archivos. No incluyas a la empresa como nodo: cada desarrollo es un nodo raíz con parent_name null y sus modelos cuelgan de él. Si un desarrollo o modelo tiene otros nombres, conserva el nombre comercial en name y pon los demás en aliases; nunca crees dos nodos para el mismo producto. Cuando name combina un descriptor genérico con un nombre comercial, agrega el nombre corto en aliases: "Modelo Solara" lleva "Solara", "Bodega Atlas" lleva "Atlas". Clasifica cada nodo con scope_type: usa proyecto para lo que se comercializa como un todo, opcion para cada variante que un comprador elige y adquiere por separado, amenidad para lo que se comparte y no se vende —alberca, casa club, áreas verdes—, etapa para una fase de construcción o entrega, y otro para lo que no encaje. La distinción que importa es si alguien puede comprar ese nodo por sí solo: si no, no es una opcion.`;
  }
}

export const documentCompilerService = new DocumentCompilerService();
