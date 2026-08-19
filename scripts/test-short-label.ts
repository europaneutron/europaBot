/**
 * Que el rotulo corto se comprueba antes de publicar, no solo se pide.
 *
 * Se hace fallar al modelo a proposito con un doble: en la primera llamada
 * de redaccion devuelve un rotulo demasiado largo para uno de los objetivos y
 * la pregunta entera como rotulo de otro. Eso provoca un reintento -- solo
 * del rotulo, no de la respuesta completa -- y si el reintento tampoco cabe,
 * el rotulo final se deriva de la clave de la pregunta.
 *
 *   npx tsx scripts/test-short-label.ts
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

function baseProposalFor(target: any, shortLabel: string) {
  return {
    proposal_key: target.proposal_key,
    intent_name: target.intent_name,
    short_label: shortLabel,
    response: `Desde {precio_desde}.`,
    required_variables: ['precio_desde'],
    keywords: ['precio', 'costo'],
    synonyms: ['cuanto cuesta', 'valor'],
    typos: ['presio'],
    phrases: ['cuanto cuesta', 'que precio tiene', 'cuanto vale'],
    question_variants: ['cuanto cuesta', 'que precio tiene'],
    offers_intent_name: null,
  };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) {
    throw new Error('Este script solo puede escribir contra Supabase local');
  }

  const { supabaseServer } = await import('../src/services/supabase/server-client');
  const { ROOT_SCOPE_ID, scopeRepository } = await import('../src/data/repositories/scope.repository');
  const { documentCompilerRepository } = await import('../src/data/repositories/document-compiler.repository');
  const { DocumentCompilerService } = await import('../src/core/document-compiler/document-compiler.service');
  const { configRepository } = await import('../src/data/repositories/config.repository');

  const suffix = randomUUID().slice(0, 8);
  const scopeIds: string[] = [];
  let runId: string | null = null;
  let materialId: string | null = null;
  let previousContext: string | null = null;

  const writingCalls: string[][] = [];
  const writingPrompts: string[] = [];
  const labelCalls: string[][] = [];

  // largo: rotulo demasiado largo en las dos vueltas -> cae al derivado.
  // pregunta: primer rotulo es la pregunta entera; el reintento la corrige.
  // correcto: rotulo valido desde la primera vuelta, nunca se reintenta.
  const questionByCase: Record<string, string> = {
    largo: '¿Cuánto cuesta el terreno y la construcción?',
    pregunta: '¿Dónde está ubicado?',
    correcto: '¿Cuál es el precio?',
  };

  class StubbedCompiler extends DocumentCompilerService {
    // Sin esto la prueba muere antes de llegar al doble: obtener el cliente
    // real exige una clave configurada, y esta prueba no llama al modelo.
    protected async getWritingClient(): Promise<any> {
      return { responses: { create: async () => { throw new Error('no debe llamarse'); } } };
    }

    protected async askModelToWrite(_openai: any, request: any) {
      const input = String(request.input);
      if (input.includes('Objetivos: ')) {
        const targets = JSON.parse(input.split('Objetivos: ')[1]);
        writingCalls.push(targets.map((t: any) => t.proposal_key));
        writingPrompts.push(input);
        const proposals = targets.map((target: any) => {
          const caseName = target.intent_name.split('_')[0];
          const shortLabel = caseName === 'largo'
            ? 'Terreno y construccion completa'
            : caseName === 'pregunta'
              ? questionByCase.pregunta
              : 'Precio';
          return baseProposalFor(target, shortLabel);
        });
        return { output_text: JSON.stringify({ proposals }) };
      }
      if (input.includes('Preguntas: ')) {
        const targets = JSON.parse(input.split('Preguntas: ')[1]);
        labelCalls.push(targets.map((t: any) => t.proposal_key));
        const labels = targets.map((target: any) => {
          const caseName = Object.entries(questionByCase)
            .find(([, question]) => question === target.question)?.[0];
          // "largo" insiste en no caber ni al reintentar.
          const shortLabel = caseName === 'largo' ? 'Todavia demasiado largo para caber' : 'Ubicacion';
          return { proposal_key: target.proposal_key, short_label: shortLabel };
        });
        return { output_text: JSON.stringify({ labels }) };
      }
      throw new Error(`Llamada inesperada: ${input.slice(0, 80)}`);
    }
  }

  try {
    const text = `material ${suffix}`;
    const { data: material, error: materialError } = await supabaseServer
      .from('compiler_materials').insert({
        scope_id: ROOT_SCOPE_ID,
        material_kind: 'text',
        original_filename: `short-label-${suffix}.txt`,
        mime_type: 'text/plain',
        plain_text: text,
        reading_status: 'ready',
        checksum: createHash('sha256').update(text).digest('hex'),
      }).select('id').single();
    if (materialError) throw materialError;
    materialId = material.id;

    const { data: development, error: developmentError } = await supabaseServer
      .from('scopes').insert({
        parent_id: ROOT_SCOPE_ID,
        name: `Label ${suffix}`,
        slug: `label-${suffix}`,
        is_active: true,
      }).select('id').single();
    if (developmentError) throw developmentError;
    scopeIds.push(development.id);

    const { data: run, error: runError } = await supabaseServer.from('compiler_runs').insert({
      scope_id: ROOT_SCOPE_ID,
      material_ids: [material.id],
      current_stage: 'content',
      status: 'running',
      tree_approved_at: new Date().toISOString(),
      replacement_mode: 'replace',
    }).select('*').single();
    if (runError) throw runError;
    runId = run.id;

    const cases = ['largo', 'pregunta', 'correcto'] as const;
    const intentNames = Object.fromEntries(cases.map(name => [name, `${name}_${suffix}`]));

    const { data: facts, error: factsError } = await supabaseServer
      .from('compiler_facts').insert(cases.map((caseName, index) => ({
        run_id: run.id,
        material_id: material.id,
        scope_id: development.id,
        fact_key: 'precio_desde',
        subject: caseName,
        fact_value: JSON.stringify(`$${1_000_000 + index * 500_000}`),
        fact_type: 'money',
        page_number: 1,
        provenance_confidence: 1,
        fingerprint: `short-label-${suffix}-${index}`,
      }))).select('id, subject');
    if (factsError) throw factsError;

    for (const caseName of cases) {
      const factIds = (facts || [])
        .filter(fact => fact.subject === caseName)
        .map(fact => fact.id);
      const { error: coverageError } = await supabaseServer.from('compiler_coverage').insert({
        run_id: run.id,
        scope_id: ROOT_SCOPE_ID,
        intent_name: intentNames[caseName],
        question: questionByCase[caseName],
        status: 'covered',
        source: 'preset',
        fact_ids: factIds,
      });
      if (coverageError) throw coverageError;
    }

    // El contexto del negocio --Ajustes > Inteligencia Artificial-- tiene que
    // llegar a la instruccion de redaccion, y acotado: es un campo libre.
    const { data: contextRow } = await supabaseServer
      .from('bot_config').select('config_value')
      .eq('config_key', 'ai_business_context').is('scope_id', null).maybeSingle();
    previousContext = contextRow?.config_value ?? '';
    const longContext = `Constructora familiar de primera vivienda. ${'Detalle irrelevante. '.repeat(60)}`;
    // Por el repositorio, no por SQL: es quien invalida su propia cache.
    await configRepository.set('ai_business_context', longContext);

    await new StubbedCompiler().runNextStage(runId as string);

    assert(
      writingPrompts[0].includes('Constructora familiar de primera vivienda.'),
      'el contexto del negocio llega a la instruccion de redaccion'
    );
    assert(
      !writingPrompts[0].includes(longContext),
      'un contexto larguisimo entra recortado, no entero'
    );
    assert(
      writingPrompts[0].includes('no es una fuente de datos')
      || writingPrompts[0].includes('no una fuente de datos'),
      'se le dice que el contexto no es una fuente de hechos'
    );

    assert(labelCalls.length === 1, `una sola vuelta de reintento de rotulo: ${labelCalls.length}`);
    assert(
      labelCalls[0].length === 2,
      `el reintento pide solo los rotulos invalidos, no los tres: ${JSON.stringify(labelCalls[0])}`
    );

    const review = await documentCompilerRepository.getReview(runId as string);
    const intentNameOf = (proposal: any) => proposal.intent_configurations?.intent_name;
    const displayNameOf = (proposal: any) => proposal.intent_configurations?.display_name;
    const byCase = Object.fromEntries(
      cases.map(caseName => [caseName, review.proposals.find((p: any) => intentNameOf(p) === intentNames[caseName])])
    );

    assert(Boolean(byCase.largo), 'el objetivo "largo" termino con propuesta');
    assert(Boolean(byCase.pregunta), 'el objetivo "pregunta" termino con propuesta');
    assert(Boolean(byCase.correcto), 'el objetivo "correcto" termino con propuesta');

    assert(
      displayNameOf(byCase.largo).length <= 20 && displayNameOf(byCase.largo) !== 'Terreno y construccion completa',
      `rotulo que no cabe ni al reintentar cae a uno derivado: "${displayNameOf(byCase.largo)}"`
    );
    assert(
      displayNameOf(byCase.largo).startsWith('Largo') && !displayNameOf(byCase.largo).includes('Terreno'),
      `el derivado sale de la clave, no de la pregunta: "${displayNameOf(byCase.largo)}"`
    );

    assert(
      displayNameOf(byCase.pregunta) === 'Ubicacion',
      `rotulo que era la pregunta se corrige con el reintento: "${displayNameOf(byCase.pregunta)}"`
    );

    assert(
      displayNameOf(byCase.correcto) === 'Precio',
      `rotulo valido desde la primera vuelta no se toca: "${displayNameOf(byCase.correcto)}"`
    );

    // Corregir el rotulo no toca vocabulario ni respuesta: siguen siendo los
    // que devolvio la llamada de redaccion, sin pasar por la de rotulos.
    assert(
      byCase.pregunta.matcher_patterns?.keywords?.includes('precio'),
      'corregir el rotulo no cambia el vocabulario de la respuesta'
    );
    assert(
      JSON.stringify(byCase.pregunta.message_text).includes('precio_desde'),
      'corregir el rotulo no cambia el texto de la respuesta'
    );
  } finally {
    if (runId) {
      await supabaseServer.from('compiler_proposals').delete().eq('run_id', runId);
      await supabaseServer.from('compiler_coverage').delete().eq('run_id', runId);
      await supabaseServer.from('compiler_facts').delete().eq('run_id', runId);
      await supabaseServer.from('compiler_runs').delete().eq('id', runId);
    }
    for (const scopeId of scopeIds.reverse()) {
      const { data: intents } = await supabaseServer
        .from('intent_configurations').select('id').eq('scope_id', scopeId);
      for (const intent of intents || []) {
        await supabaseServer.from('bot_responses').delete().eq('intent_id', intent.id);
        await supabaseServer.from('intent_configurations').delete().eq('id', intent.id);
      }
      await supabaseServer.from('scopes').delete().eq('id', scopeId);
    }
    if (previousContext !== null) {
      await configRepository.set('ai_business_context', previousContext);
    }
    if (materialId) await supabaseServer.from('compiler_materials').delete().eq('id', materialId);
    scopeRepository.invalidateCache();
  }
}

main()
  .then(() => console.log('\nRotulo corto verificado: se comprueba antes de publicar, no solo se pide'))
  .catch(error => { console.error(error); process.exit(1); });
