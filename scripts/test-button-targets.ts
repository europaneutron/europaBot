/**
 * Con que puede encadenar un boton, y que pasa cuando el destino no contesta.
 *
 * La herencia va de hijo a padre. Encadenar con la pregunta de un hermano no
 * falla con un error: el runtime no la encuentra y se va por otra rama --fija
 * el foco y presenta el alcance-- asi que el lead toca una cosa y recibe otra.
 * Por eso el filtro tiene que ser el mismo `resolveRows` del runtime.
 *
 *   npx tsx scripts/test-button-targets.ts
 */
import { randomUUID } from 'node:crypto';
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
  const { ROOT_SCOPE_ID, scopeRepository } = await import('../src/data/repositories/scope.repository');
  const { intentDetectionService } = await import('../src/core/intent-engine/intent-detection.service');

  const suffix = randomUUID().slice(0, 8);
  const scopeIds: string[] = [];
  const intentIds: string[] = [];

  const createIntent = async (scopeId: string, name: string) => {
    const { data, error } = await supabaseServer
      .from('intent_configurations')
      .insert({
        scope_id: scopeId,
        intent_name: name,
        display_name: name,
        keywords: [`${name}kw`],
        synonyms: [], typos: [], phrases: [],
        is_active: true, is_checkpoint: false, is_strong_signal: false,
      })
      .select('id')
      .single();
    if (error) throw error;
    intentIds.push(data.id);
    return data.id as string;
  };

  try {
    const europa = await scopeRepository.create({
      name: `Europa ${suffix}`, slug: `europa-t-${suffix}`, parent_id: ROOT_SCOPE_ID, is_active: true,
    });
    const malasia = await scopeRepository.create({
      name: `Malasia ${suffix}`, slug: `malasia-t-${suffix}`, parent_id: ROOT_SCOPE_ID, is_active: true,
    });
    scopeIds.push(europa.id, malasia.id);

    const negocioIntent = `entrega_${suffix}`;
    const europaIntent = `amenidades_${suffix}`;
    const malasiaIntent = `compra_minima_${suffix}`;
    await createIntent(ROOT_SCOPE_ID, negocioIntent);
    await createIntent(europa.id, europaIntent);
    await createIntent(malasia.id, malasiaIntent);

    console.log('\n1. Un alcance alcanza lo suyo y lo del negocio, no lo del hermano');
    const { data: allIntents } = await supabaseServer
      .from('intent_configurations')
      .select('id, intent_name, display_name, scope_id, is_active')
      .eq('is_active', true);
    const reachable = await scopeRepository.resolveRows(allIntents || [], europa.id, row => row.intent_name);
    const names = reachable.map(row => row.intent_name);

    assert(names.includes(europaIntent), 'Europa alcanza su propia pregunta');
    assert(names.includes(negocioIntent), 'y la del negocio, por herencia');
    assert(!names.includes(malasiaIntent), 'pero no la de Malasia, que es su hermano');

    console.log('\n2. Y coincide con lo que el runtime sabe resolver');
    scopeRepository.invalidateCache();
    await intentDetectionService.refresh(supabaseServer, europa.id);
    const resolvedSibling = await intentDetectionService.resolveByName(
      malasiaIntent, supabaseServer, europa.id
    );
    assert(
      resolvedSibling === null,
      'desde Europa, la pregunta de Malasia no se resuelve: un boton asi llevaria a otra cosa'
    );
    const resolvedOwn = await intentDetectionService.resolveByName(
      negocioIntent, supabaseServer, europa.id
    );
    assert(Boolean(resolvedOwn), 'la heredada del negocio si se resuelve desde Europa');

    console.log('\n3. Se sabe cual tiene con que contestar');
    const europaIntentId = intentIds[1];
    const { data: withResponse } = await supabaseServer
      .from('bot_responses')
      .select('intent_id')
      .in('intent_id', reachable.map(row => row.id))
      .eq('is_active', true);
    const answered = new Set((withResponse || []).map(row => row.intent_id));
    assert(!answered.has(europaIntentId), 'recien creada, la pregunta de Europa no tiene respuesta');

    await supabaseServer.from('bot_responses').insert({
      intent_id: europaIntentId,
      response_key: `amenidades_${suffix}`,
      message_text: 'Tenemos alberca y casa club.',
      response_type: 'simple',
      order_priority: 1,
      is_active: true,
      origin: 'manual',
    });
    const { data: afterInsert } = await supabaseServer
      .from('bot_responses')
      .select('intent_id')
      .eq('intent_id', europaIntentId)
      .eq('is_active', true);
    assert((afterInsert || []).length === 1, 'con respuesta escrita, ya tiene con que contestar');
  } finally {
    for (const id of intentIds) {
      await supabaseServer.from('bot_responses').delete().eq('intent_id', id);
      await supabaseServer.from('intent_configurations').delete().eq('id', id);
    }
    for (const id of scopeIds.reverse()) {
      await supabaseServer.from('catalog_values').delete().eq('scope_id', id);
      await supabaseServer.from('scopes').delete().eq('id', id);
    }
    scopeRepository.invalidateCache();
    await intentDetectionService.refresh(supabaseServer, ROOT_SCOPE_ID);
  }
}

main()
  .then(() => console.log('\nDestinos verificados: lo suyo y lo del negocio, nunca lo del hermano'))
  .catch(error => { console.error(error); process.exit(1); });
