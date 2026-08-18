import { z } from 'zod';
import type { ResponseInputContent } from 'openai/resources/responses/responses';
import {
  consolidateFacts,
  changedFactFingerprints,
  deriveCoverage,
  factFingerprint,
  groupFactsByDestination,
  mergeCandidates,
  REAL_ESTATE_PRESET,
  reviewSignalsForFacts,
  sharedFactsForAncestor,
} from '@/core/document-compiler/compiler-rules';
import {
  SCOPE_TYPE_VALUES,
  type CandidateQuestion,
  type ExtractedFact,
} from '@/data/models/document-compiler.model';
import { documentCompilerRepository } from '@/data/repositories/document-compiler.repository';
import { getAiModel, getOpenAIClient } from '@/services/ai/openai.service';
import { getCompilerMaterialModelSource } from '@/services/storage/compiler-material-storage';
import { clientBrandRepository } from '@/data/repositories/client-brand.repository';
import { toClientVocabulary, toneInstruction } from '@/core/onboarding/client-vocabulary';
import { scopeRepository } from '@/data/repositories/scope.repository';

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
        required: ['proposal_key', 'intent_name', 'response', 'keywords', 'synonyms', 'typos', 'phrases'],
        properties: {
          proposal_key: { type: 'string' },
          intent_name: { type: 'string' },
          response: { type: 'string' },
          keywords: { type: 'array', items: { type: 'string' } },
          synonyms: { type: 'array', items: { type: 'string' } },
          typos: { type: 'array', items: { type: 'string' } },
          phrases: { type: 'array', items: { type: 'string' } },
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
    keywords: z.array(z.string()).default([]),
    synonyms: z.array(z.string()).default([]),
    typos: z.array(z.string()).default([]),
    phrases: z.array(z.string()).default([]),
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
      covered = covered.filter((coverage: any) =>
        facts.some(fact => coverage.fact_ids.includes(fact.id) && changedKeys!.has(fact.key))
      );

      const currentKeys = new Set(facts.map(fact => fact.key));
      const disappearedFacts = previousFacts.filter(fact => !currentKeys.has(fact.key));
      await documentCompilerRepository.flagUnsupportedResponsesForFacts(
        disappearedFacts.flatMap(fact => fact.id ? [fact.id] : [])
      );
    }

    const writingTargets = covered.flatMap((coverage: any) => {
      const supportingFacts = facts.filter(fact => coverage.fact_ids.includes(fact.id));
      return groupFactsByDestination(supportingFacts, run.scope_id, scopes).map(group => ({
        proposalKey: `${coverage.id}:${group.scopeId}`,
        coverage,
        scopeId: group.scopeId,
        facts: group.facts,
      }));
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
      input: `Redacta exactamente una respuesta breve de WhatsApp por cada objetivo usando exclusivamente sus hechos. Conserva proposal_key e intent_name literalmente. No combines objetivos, no inventes, no agregues invitaciones a agendar y no uses emojis. ${brandInstruction} Devuelve JSON con {"proposals":[{"proposal_key":"...","intent_name":"...","response":"...","keywords":[],"synonyms":[],"typos":[],"phrases":[]}]}.\n\nObjetivos: ${JSON.stringify(writingTargets.map(target => ({ proposal_key: target.proposalKey, intent_name: target.coverage.intent_name, question: target.coverage.question, scope_id: target.scopeId, facts: target.facts.map(fact => ({ id: fact.id, key: fact.key, subject: fact.subject, value: fact.value })) })))}`,
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
      const intentKeywords = String(target.coverage.intent_name)
        .split(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ]+/)
        .map(value => value.toLowerCase())
        .filter(value => value.length >= 4 && value !== 'consultar');

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
        matcherPatterns: {
          keywords: Array.from(new Set([
            ...(template?.keywords || []),
            ...proposal.keywords,
            ...intentKeywords,
          ])),
          synonyms: Array.from(new Set([...(template?.synonyms || []), ...proposal.synonyms])),
          typos: Array.from(new Set([...(template?.typos || []), ...proposal.typos])),
          phrases: Array.from(new Set([
            ...(template?.phrases || []),
            ...proposal.phrases,
            target.coverage.question,
          ])),
        },
        signals: reviewSignalsForFacts(target.facts, {
          changed: Boolean(changedKeys),
          humanEdited: previousProposal?.edited_by_human || false,
        }),
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

proposed_tree describe únicamente estructura que el material sustenta y debe incluir todos los desarrollos de todos los archivos. No incluyas a la empresa como nodo: cada desarrollo es un nodo raíz con parent_name null y sus modelos cuelgan de él. Si un desarrollo o modelo tiene otros nombres, conserva el nombre comercial en name y pon los demás en aliases; nunca crees dos nodos para el mismo producto. Clasifica cada nodo con scope_type: usa proyecto para lo que se comercializa como un todo, opcion para cada variante que un comprador elige y adquiere por separado, amenidad para lo que se comparte y no se vende —alberca, casa club, áreas verdes—, etapa para una fase de construcción o entrega, y otro para lo que no encaje. La distinción que importa es si alguien puede comprar ese nodo por sí solo: si no, no es una opcion.`;
  }
}

export const documentCompilerService = new DocumentCompilerService();
