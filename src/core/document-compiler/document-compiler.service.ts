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
  presetLeadForms,
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
import { catalogValueRepository } from '@/data/repositories/catalog-value.repository';
import { extractVariableKeys, normalizeVariableKey } from '@/lib/interpolate-message';

const VOCABULARY_GENERATION_VERSION = 8;

// Lo que describe una unidad y acompana bien a su precio. No es vocabulario del
// sector cableado: son las claves que el propio material produjo, y si un
// negocio no las tiene, no aporta ninguna.
const FICHA_FACT_KEYS = /(?:recamara|habitacion|bano|construccion|terreno|superficie|cochera|nivel|planta)/i;

const extractionSchema = z.object({
  facts: z.array(z.object({
    material_id: z.string().uuid(),
    key: z.string().min(1),
    subject: z.string().nullable().optional(),
    value: z.unknown(),
    type: z.enum(['text', 'money', 'date', 'contractual', 'number', 'location']).default('text'),
    unit: z.string().nullable().default(null),
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
        required: ['material_id', 'key', 'subject', 'value', 'type', 'unit', 'page', 'provenance_confidence'],
        properties: {
          material_id: { type: 'string' },
          key: { type: 'string' },
          subject: { type: ['string', 'null'] },
          value: { type: 'string' },
          type: { type: 'string', enum: ['text', 'money', 'date', 'contractual', 'number', 'location'] },
          unit: { type: ['string', 'null'] },
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
        required: ['proposal_key', 'intent_name', 'short_label', 'response', 'required_variables', 'keywords', 'synonyms', 'typos', 'phrases', 'question_variants', 'offers_intent_name'],
        properties: {
          proposal_key: { type: 'string' },
          intent_name: { type: 'string' },
          short_label: { type: 'string' },
          response: { type: 'string' },
          required_variables: { type: 'array', items: { type: 'string' } },
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

// Un boton de WhatsApp admite 20 caracteres. Pedirlo en el prompt no basta
// --"Terreno y construccion" son 22-- asi que se comprueba antes de publicar.
const SHORT_LABEL_MAX_LENGTH = 20;

const SHORT_LABEL_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['labels'],
  properties: {
    labels: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['proposal_key', 'short_label'],
        properties: {
          proposal_key: { type: 'string' },
          short_label: { type: 'string' },
        },
      },
    },
  },
} as const;

const shortLabelSchema = z.object({
  labels: z.array(z.object({
    proposal_key: z.string(),
    short_label: z.string().min(1),
  })),
});

const writingSchema = z.object({
  proposals: z.array(z.object({
    proposal_key: z.string(),
    intent_name: z.string(),
    short_label: z.string().min(1),
    response: z.string().min(1),
    required_variables: z.array(z.string().min(1)),
    keywords: z.array(z.string().min(1)).min(2),
    synonyms: z.array(z.string().min(1)).min(2),
    typos: z.array(z.string().min(1)).min(1),
    phrases: z.array(z.string().min(1)).min(3),
    question_variants: z.array(z.string().min(1)).min(2),
    offers_intent_name: z.string().nullable(),
  })),
});

/**
 * La cadena de alcances desde uno dado hasta la raiz, sobre el arbol tal como
 * esta propuesto y sin mirar si cada alcance esta encendido.
 *
 * Es la vista que necesita el compilador: lo que publica todavia no esta
 * activo. El runtime usa `scopeRepository.getResolutionOrder`, que si excluye
 * lo inactivo porque un alcance retirado tiene que dejar de responder.
 */
/**
 * Una lista se enumera sola al renderizar, asi que su hueco va una vez. El
 * modelo tiende a escribirlo tantas veces como elementos cree que hay --"Tiene
 * {amenidad}, {amenidad}, {amenidad} y {amenidad}"--, y eso repetiria la lista
 * entera esas veces. Se colapsa una serie del mismo hueco separada por comas o
 * por "y", que es la unica forma en que aparece.
 */
export function collapseRepeatedHoles(text: string): string {
  return text.replace(
    /\{([0-9A-Za-z_\u00C0-\u024F]+)\}(?:\s*(?:,|y|,\s*y|;)\s*\{\1\})+/g,
    '{$1}'
  );
}

function normalizeForLabelComparison(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Un rotulo que cabe en un boton y que no es la pregunta entera. El modelo
 * puede devolver cualquiera de las dos cosas mal --"Terreno y construccion"
 * cuelga en un boton, y a veces devuelve la pregunta completa como rotulo--
 * asi que se comprueba en vez de confiar en que el prompt se cumplio.
 */
export function isValidShortLabel(label: string | null | undefined, question: string): boolean {
  const trimmed = (label || '').trim();
  if (!trimmed) return false;
  if (trimmed.length > SHORT_LABEL_MAX_LENGTH) return false;
  return normalizeForLabelComparison(trimmed) !== normalizeForLabelComparison(question);
}

/**
 * Ultimo recurso cuando el modelo no da un rotulo que quepa ni al reintentar:
 * se deriva de la clave de la pregunta, no de la pregunta misma, porque
 * recortar la pregunta por palabras deja accidentes como "Terreno y" colgando.
 */
export function deriveShortLabelFromKey(intentName: string): string {
  const words = intentName
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());

  let label = '';
  for (const word of words) {
    const candidate = label ? `${label} ${word}` : word;
    if (candidate.length > SHORT_LABEL_MAX_LENGTH) break;
    label = candidate;
  }

  if (label) return label;
  const fallback = words[0] || intentName;
  return fallback.slice(0, SHORT_LABEL_MAX_LENGTH);
}

function proposedResolutionChain(
  scopeId: string,
  scopes: Array<{ id: string; parent_id: string | null }>
): Set<string> {
  const byId = new Map(scopes.map(scope => [scope.id, scope]));
  const chain = new Set<string>();
  let current: string | null = scopeId;
  while (current && !chain.has(current)) {
    chain.add(current);
    current = byId.get(current)?.parent_id ?? null;
  }
  return chain;
}

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
        unit: fact.unit,
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
      unit: row.unit,
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
        // El precio manda, pero la ficha del mismo alcance viaja con el: quien
        // pregunta el precio de un modelo agradece saber de cuantas recamaras
        // es sin tener que preguntarlo aparte. Solo lo del propio alcance, y
        // solo si hay precio: sin el, esto no es una respuesta de precio.
        const priceAliases = REAL_ESTATE_PRESET.find(item => item.intentName === 'precio')!.factKeys;
        const priceFacts = supportingFacts.filter(fact => (
          priceAliases.some(alias => keyMatchesAlias(fact.key, alias))
        ));
        const priceScopeIds = new Set(priceFacts.map(fact => fact.scopeId));
        supportingFacts = priceFacts.length === 0
          ? priceFacts
          : facts.filter(fact => (
              priceFacts.includes(fact)
              || (priceScopeIds.has(fact.scopeId) && FICHA_FACT_KEYS.test(fact.key))
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
      this.getWritingClient(),
      getAiModel('writing'),
      clientBrandRepository.get(),
    ]);
    const vocabulary = toClientVocabulary(brand);
    const linkedDataInstruction = 'Todo dato de un hecho debe aparecer como un hueco con su key exacta entre llaves, por ejemplo "Desde {precio}". Nunca copies cifras, importes, fechas, medidas ni otros valores dentro de la prosa. required_variables debe enumerar exactamente las keys usadas como huecos en response.';
    const brandInstruction = [
      linkedDataInstruction,
      brand.is_configured
        ? `${toneInstruction(brand.tone)} Llama a los proyectos "${vocabulary.plural}" y a uno solo "${vocabulary.singular}".`
        : '',
    ].filter(Boolean).join(' ');
    const requestProposals = async (targets: typeof writingTargets) => {
      const response = await this.askModelToWrite(openai, {
      model,
      store: false,
      input: `Redacta exactamente una respuesta de WhatsApp por cada objetivo usando exclusivamente sus hechos. Conserva proposal_key e intent_name literalmente. short_label es como se llama ese tema en un boton: de una a tres palabras, sustantivo, en el idioma del material, sin signos de interrogacion y sin pasar de 20 caracteres --"Recamaras y banos", "Ubicacion", "Creditos"--; no es la pregunta ni una frase. No inventes y no uses emojis. Una respuesta corta pero completa: si el objetivo trae varios hechos sobre lo mismo --precio, recamaras, banos, construccion, terreno-- dilos todos en la misma respuesta, porque el lead no tiene por que preguntarlos uno a uno. No mezcles objetivos distintos: lo que pertenece a otra pregunta se queda en esa. Cuando un dato venga repetido con la misma clave --varias amenidades, varios creditos aceptados-- es una lista y su hueco se escribe UNA sola vez: el sistema la enumera entera. ${brandInstruction} Para cada objetivo genera tambien el vocabulario con el que un lead preguntaria eso por WhatsApp. Las palabras deben salir de los hechos y del material de este cliente: no uses una lista fija del sector. keywords lleva al menos 2 palabras principales, synonyms al menos 2 formas equivalentes, typos al menos 1 errata probable y phrases al menos 3 preguntas completas y naturales. question_variants lleva 2 reformulaciones breves que funcionen como mensaje autonomo, sin nombre de empresa, desarrollo, modelo ni producto concreto; por ejemplo, para una pregunta de precio una variante seria "cuanto cuesta" y no "cuanto cuesta el modelo X". El nombre intent_name no cuenta como vocabulario y no debes copiarlo para completar listas. Termina ofreciendo el paso siguiente cuando haya uno natural: otra pregunta de esta misma lista que el lead querria despues, o agendar una visita. La oferta se convierte en un boton, asi que la pregunta puede ser de si o no; lo que no puede es quedar sin declarar. Pon en offers_intent_name el intent_name de lo que ofreces --uno de los objetivos de esta lista, o "cita" para agendar-- y deja offers_intent_name en null solo cuando la respuesta no ofrezca nada. Devuelve JSON con {"proposals":[{"proposal_key":"...","intent_name":"...","response":"...","keywords":["..."],"synonyms":["..."],"typos":["..."],"phrases":["..."],"question_variants":["..."],"offers_intent_name":null}]}.\n\nObjetivos: ${JSON.stringify(targets.map(target => ({ proposal_key: target.proposalKey, intent_name: target.coverage.intent_name, question: target.coverage.question, scope_id: target.scopeId, facts: target.facts.map(fact => ({ id: fact.id, key: fact.key, subject: fact.subject, value: fact.value })) })))}`,
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
      return new Map(generated.proposals.map(item => [item.proposal_key, item]));
    };

    const generatedByKey = await requestProposals(writingTargets);

    // El modelo puede volver con un objetivo menos y sin decirlo. Paso: en la
    // corrida de FYMSA del 18 de agosto volvio con cinco precios de seis, y el
    // precio del Modelo Aura --extraido, asignado a su alcance-- se quedo sin
    // publicar. Se reintenta una vez con los que faltan, que es una llamada
    // corta, antes de darlo por hueco.
    const missingTargets = writingTargets.filter(target => !generatedByKey.has(target.proposalKey));
    if (missingTargets.length > 0) {
      const retried = await requestProposals(missingTargets);
      retried.forEach((value, key) => generatedByKey.set(key, value));
    }

    // El rotulo corto se comprueba antes de publicar, no solo se pide: un
    // boton de WhatsApp admite 20 caracteres y el modelo a veces devuelve la
    // pregunta entera en vez de un rotulo. Se reintenta una vez solo el
    // rotulo -- el mismo patron que la propuesta faltante, pero sin volver a
    // pedir la respuesta completa -- y si el segundo tampoco cabe, se deriva
    // uno determinista de la clave de la pregunta.
    const requestShortLabels = async (targets: typeof writingTargets) => {
      const response = await this.askModelToWrite(openai, {
        model,
        store: false,
        input: `El rotulo que diste para cada pregunta no sirve para un boton de WhatsApp: o pasa de ${SHORT_LABEL_MAX_LENGTH} caracteres o repite la pregunta completa. Da un rotulo nuevo por cada proposal_key: de una a tres palabras, sustantivo, en el idioma de la pregunta, sin signos de interrogacion y sin pasar de ${SHORT_LABEL_MAX_LENGTH} caracteres --"Recamaras y banos", "Ubicacion", "Creditos"--. No es la pregunta ni una frase. Devuelve JSON con {"labels":[{"proposal_key":"...","short_label":"..."}]}.\n\nPreguntas: ${JSON.stringify(targets.map(target => ({ proposal_key: target.proposalKey, question: target.coverage.question })))}`,
        text: {
          format: {
            type: 'json_schema',
            name: 'compiler_short_label',
            strict: true,
            schema: SHORT_LABEL_JSON_SCHEMA as unknown as Record<string, unknown>,
          },
        },
      });
      const parsed = shortLabelSchema.parse(JSON.parse(response.output_text));
      return new Map(parsed.labels.map(item => [item.proposal_key, item.short_label]));
    };

    const invalidLabelTargets = writingTargets.filter(target => {
      const proposal = generatedByKey.get(target.proposalKey);
      return Boolean(proposal) && !isValidShortLabel(proposal!.short_label, target.coverage.question);
    });
    if (invalidLabelTargets.length > 0) {
      // Si el reintento falla, no se pierde la corrida: la extraccion y la
      // redaccion --las dos llamadas caras-- ya estan pagadas, y abajo hay un
      // rotulo determinista que sirve. Un paso de acabado no puede costar el
      // trabajo entero.
      try {
        const relabeled = await requestShortLabels(invalidLabelTargets);
        for (const target of invalidLabelTargets) {
          const proposal = generatedByKey.get(target.proposalKey);
          const relabel = relabeled.get(target.proposalKey);
          if (proposal && relabel !== undefined) proposal.short_label = relabel;
        }
      } catch (labelError) {
        console.error('Error al reintentar los rotulos cortos; se derivan de la clave:', labelError);
      }
    }
    for (const target of writingTargets) {
      const proposal = generatedByKey.get(target.proposalKey);
      if (proposal && !isValidShortLabel(proposal.short_label, target.coverage.question)) {
        proposal.short_label = deriveShortLabelFromKey(target.coverage.intent_name);
      }
    }

    const proposals = [];
    const placementErrors = new Map<string, string[]>();

    for (const target of writingTargets) {
      const proposal = generatedByKey.get(target.proposalKey);
      if (!proposal) {
        const errors = placementErrors.get(target.coverage.id) || [];
        // Con el nombre del alcance, no con su identificador: el panel lo lee
        // una persona que tiene que decidir si recompila o lo escribe a mano.
        const scopeName = scopes.find((scope: any) => scope.id === target.scopeId)?.name;
        errors.push(`No se generó contenido para ${scopeName || target.scopeId}, ni al reintentar`);
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
        // Las formas del lead del catalogo entran siempre: el material puede
        // sumar vocabulario, no puede dejar sin cubrir la forma basica de
        // preguntar. `keepVocabulary` no las filtra --no son nombres de
        // alcance-- pero pasan por el mismo tamiz por coherencia.
        phrases: Array.from(new Set([
          ...proposal.phrases,
          ...proposal.question_variants,
          ...target.extraPhrases,
          ...presetLeadForms(target.coverage.intent_name),
        ].filter(keepVocabulary))),
      };
      // La comprobacion se hace contra las formas del lead, no solo contra la
      // pregunta que escribio el propio compilador: alcanzar la propia
      // redaccion es una vara que cualquier vocabulario pasa.
      const vocabularyCheck = vocabularyReachesQuestion(
        matcherPatterns,
        target.coverage.question,
        [...proposal.question_variants, ...presetLeadForms(target.coverage.intent_name)]
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

      // Ambos lados se comparan normalizados: el modelo declara `ubicación` y
      // escribe `{ubicacion}` --o al reves-- y eso no es una discrepancia, es
      // el mismo dato con y sin acento.
      proposal.response = collapseRepeatedHoles(proposal.response);
      const variableKeys = extractVariableKeys(proposal.response);
      const declaredVariableKeys = Array.from(new Set(
        proposal.required_variables.map(normalizeVariableKey)
      ));
      const declarationMismatch = Array.from(new Set([
        ...variableKeys.filter(key => !declaredVariableKeys.includes(key)),
        ...declaredVariableKeys.filter(key => !variableKeys.includes(key)),
      ]));
      // La cadena se recorre sobre el arbol propuesto, no con
      // `getResolutionOrder`: esa funcion excluye un alcance inactivo --y lo
      // hace bien, porque en el runtime un alcance retirado deja de
      // responder--, pero los alcances que esta corrida acaba de crear nacen
      // inactivos y se encienden al publicar. Preguntarle por ellos devolvia la
      // cadena sin el alcance mismo, asi que ningun hecho suyo contaba como
      // disponible y todo hueco se marcaba como valor faltante: en la corrida
      // de FYMSA se bloquearon 17 de 21 propuestas, incluida la del precio de
      // Solara, cuyo `precio_desde` estaba en sus hechos y acabo en el catalogo.
      const resolutionOrder = proposedResolutionChain(target.scopeId, scopes);
      const resolvableFacts = target.facts.filter(fact => resolutionOrder.has(fact.scopeId));
      const existingCatalog = await catalogValueRepository.getResolvedVariables(target.scopeId);
      const availableValueKeys = new Set([
        ...resolvableFacts.map(fact => normalizeVariableKey(fact.key)),
        ...Object.keys(existingCatalog).map(normalizeVariableKey),
      ]);
      const missingVariables = variableKeys.filter(key => !availableValueKeys.has(key));
      const unlinkedRequiredKeys = Array.from(new Set(
        resolvableFacts
          .filter(fact => ['money', 'number', 'date'].includes(fact.type))
          .map(fact => normalizeVariableKey(fact.key))
          .filter(key => !variableKeys.includes(key))
      ));
      const literalValues = resolvableFacts.flatMap(fact => {
        if (!['money', 'number', 'date'].includes(fact.type)) return [];
        const rendered = typeof fact.value === 'string'
          ? fact.value.trim()
          : String(fact.value);
        return rendered.length >= 2
          && proposal.response.includes(rendered)
          && !variableKeys.includes(fact.key)
          ? [rendered]
          : [];
      });

      // No mencionar un dato no es un defecto: el material trae cifras que la
      // respuesta no tiene por que decir --la superficie del parque lineal en
      // una respuesta de amenidades-- y exigir que todas se enlacen bloqueaba
      // preguntas enteras. En la corrida de FYMSA dejo sin `amenidades` y sin
      // `creditos` a los dos desarrollos: el lead preguntaba y recibia el
      // fallback. Lo que si es un defecto es escribir la cifra dentro del
      // texto en vez de enlazarla, y de eso se ocupa `literal_catalog_value`.
      // Declarar un dato que luego no se menciona tampoco rompe nada: lo que
      // importa es que los huecos del texto se puedan rellenar, y de eso se
      // ocupa `missingVariables`. Exigir que la lista declarada coincidiera
      // exactamente con el texto dejo a los dos desarrollos sin `creditos`.
      if (missingVariables.length > 0) {
        signals.push('missing_catalog_value');
      }
      if (literalValues.length > 0) signals.push('literal_catalog_value');

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
        // El rotulo corto manda sobre lo que hubiera: es lo unico que el lead
        // ve de este nombre cuando la pregunta se ofrece como boton.
        displayName: proposal.short_label?.trim() || template?.display_name || target.coverage.question,
        minConfidence: Number(template?.min_confidence ?? 0.6),
        priority: Number(template?.priority ?? 0),
        responseKey: `compiler_${target.coverage.intent_name}`,
        messageText: { fragments: [{ type: 'text' as const, content: proposal.response, delay: 0 }] },
        matcherPatterns,
        signals,
        offersIntentName: proposal.offers_intent_name || null,
        isPublishable:
          vocabularyCheck.missed.length === 0
          && !offerReason
          && !offerTargetMissing
          && !branchReason
          && missingVariables.length === 0
          && literalValues.length === 0,
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
          catalog: {
            required: variableKeys,
            missing: missingVariables,
            declaration_mismatch: declarationMismatch,
            unlinked: unlinkedRequiredKeys,
            literal_values: literalValues,
            reason: missingVariables.length > 0
              ? `Faltan valores del catálogo: ${missingVariables.join(', ')}.`
              : declarationMismatch.length > 0
                ? `La declaración de huecos no coincide: ${declarationMismatch.join(', ')}.`
                : literalValues.length > 0
                  ? 'La respuesta copia un dato literal que debe enlazarse al catálogo.'
                  : null,
          },
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
      unit: row.unit,
      page: row.page_number,
      provenanceConfidence: Number(row.provenance_confidence),
      fingerprint: row.fingerprint,
      contradictory: row.is_contradictory,
    };
  }

  /**
   * La llamada al modelo de la etapa de redaccion, en un metodo propio.
   *
   * No es indireccion por gusto: es el unico punto por el que una prueba puede
   * hacer que el modelo se porte mal a proposito --devolver un objetivo de
   * menos, JSON malformado, nada-- sin pagar una llamada real y sin esperar a
   * que ocurra solo. La omision que dejo al Modelo Aura sin precio publicado
   * paso una vez en seis corridas; asi se reproduce en milisegundos.
   *
   * En produccion nada cambia: recibe el cliente real y lo llama igual.
   */
  protected async askModelToWrite(
    openai: { responses: { create: (request: any) => Promise<any> } },
    request: any
  ): Promise<{ output_text: string }> {
    return openai.responses.create(request);
  }

  /**
   * De donde sale el cliente de la redaccion. Es un seam aparte del anterior
   * porque obtener el cliente exige una clave configurada: un doble que solo
   * sustituya `askModelToWrite` moria aqui antes de llegar a la llamada, y la
   * comprobacion del rotulo se quedaba sin prueba posible.
   */
  protected async getWritingClient(): Promise<any> {
    return getOpenAIClient();
  }

  private extractionPrompt(materials: Array<{ id: string; filename: string }>): string {
    return `Extrae hechos atómicos verificables de todo el material. Devuelve solo JSON con las claves facts, candidate_questions, business_name y proposed_tree. Cada hecho debe llevar material_id, key, subject, value, type (text, money, date, contractual, number o location), unit, page y provenance_confidence. unit es la unidad separada del valor (MXN, m2, recámaras) o null cuando no aplica.

subject dice de quién habla el hecho, con el nombre tal como aparece en el material: el modelo, la etapa o la unidad concreta cuando el dato es de una de ellas, y el nombre del desarrollo cuando el dato es del desarrollo entero —su dirección, su horario, sus amenidades, cuántas casas tiene—. Úsalo siempre que el mismo dato pueda existir para varias cosas, de modo que tres modelos con tres precios sean tres hechos con la misma key y distinto subject. Un mismo envío puede traer varios desarrollos, así que "el desarrollo entero" no basta para identificarlo: nómbralo. Deja subject en null únicamente cuando el hecho sea de la empresa completa y valga igual para todos sus desarrollos.

Usa la misma key para el mismo tipo de dato en todo el material, y nómbrala en el idioma del documento. Descarta cualquier hecho cuya página no puedas atribuir. No resuelvas contradicciones ni elijas un valor: si el material afirma dos valores para el mismo subject, devuelve los dos. material_id debe ser uno de: ${JSON.stringify(materials)}. Las preguntas solo son candidatas; el preset nunca aporta hechos. business_name es la empresa que vende, solo cuando el material la identifica de forma explícita; no uses ahí el nombre del proyecto.

Conserva también el vocabulario comercial del material: por cada nombre genérico con el que el documento llama a algo que vende —por ejemplo casas, lotes de terreno, bodegas o consultorios— agrega un hecho separado con key producto_ofrecido y value igual a ese término, sin reemplazarlo por una palabra del sector.

proposed_tree describe únicamente estructura que el material sustenta y debe incluir todos los desarrollos de todos los archivos. No incluyas a la empresa como nodo: cada desarrollo es un nodo raíz con parent_name null y sus modelos cuelgan de él. Si un desarrollo o modelo tiene otros nombres, conserva el nombre comercial en name y pon los demás en aliases; nunca crees dos nodos para el mismo producto. Cuando name combina un descriptor genérico con un nombre comercial, agrega el nombre corto en aliases: "Modelo Solara" lleva "Solara", "Bodega Atlas" lleva "Atlas". Clasifica cada nodo con scope_type: usa proyecto para lo que se comercializa como un todo, opcion para cada variante que un comprador elige y adquiere por separado, amenidad para lo que se comparte y no se vende —alberca, casa club, áreas verdes—, etapa para una fase de construcción o entrega, y otro para lo que no encaje. La distinción que importa es si alguien puede comprar ese nodo por sí solo: si no, no es una opcion.`;
  }
}

export const documentCompilerService = new DocumentCompilerService();
