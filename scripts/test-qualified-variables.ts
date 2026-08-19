/**
 * Citar el dato de otro alcance: `{europa.precio}`.
 *
 * La herencia solo va de hijo a padre, asi que un mensaje del negocio no puede
 * usar el precio de un desarrollo. Citando la procedencia si puede, y sin
 * ambiguedad: quien escribe dice de donde sale el dato. Es solo para componer
 * el texto; no cambia donde vive el dato ni que alcance esta contestando.
 *
 *   npx tsx scripts/test-qualified-variables.ts
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
  const { scopeRoutingRepository } = await import('../src/data/repositories/scope-routing.repository');
  const { catalogValueRepository } = await import('../src/data/repositories/catalog-value.repository');
  const { conversationRepository } = await import('../src/data/repositories/conversation.repository');
  const { normalizeScopeAlias } = await import('../src/core/onboarding/client-vocabulary');

  const suffix = randomUUID().slice(0, 6);
  const { data: admin } = await supabaseServer.from('admin_users').select('id').limit(1).single();
  if (!admin) throw new Error('Se necesita un administrador local: corre scripts/seed-local-admin.ts');

  const scopeIds: string[] = [];
  let intentId: string | null = null;

  try {
    const europa = await scopeRepository.create({
      name: `Europa Residencial ${suffix}`, slug: `eu-q-${suffix}`,
      parent_id: ROOT_SCOPE_ID, is_active: true,
    });
    const malasia = await scopeRepository.create({
      name: `Malasia Residencial ${suffix}`, slug: `ma-q-${suffix}`,
      parent_id: ROOT_SCOPE_ID, is_active: true,
    });
    scopeIds.push(europa.id, malasia.id);
    await scopeRoutingRepository.createAliases(europa.id, [
      { alias: `Europa ${suffix}`, normalizedAlias: normalizeScopeAlias(`Europa ${suffix}`) },
    ]);

    await catalogValueRepository.createValue(europa.id, 'precio', { value: '700000', valueType: 'money', unit: 'MXN' }, admin.id);
    await catalogValueRepository.createValue(malasia.id, 'precio', { value: '850000', valueType: 'money', unit: 'MXN' }, admin.id);
    await catalogValueRepository.createValue(malasia.id, 'compra_minima', { value: '5 lotes', valueType: 'text' }, admin.id);

    console.log('\n1. El dato de cada alcance se puede nombrar con su procedencia');
    const qualified = await catalogValueRepository.getQualifiedVariables();
    const europaKey = `${normalizeScopeAlias(`Europa Residencial ${suffix}`).replace(/\s+/g, '_')}.precio`;
    const aliasKey = `${normalizeScopeAlias(`Europa ${suffix}`).replace(/\s+/g, '_')}.precio`;
    assert(qualified[europaKey] === '$700,000', `por su nombre completo: ${europaKey} = ${qualified[europaKey]}`);
    assert(qualified[aliasKey] === '$700,000', `y por su alias: ${aliasKey}`);

    console.log('\n2. Un mensaje del negocio compone datos de los dos desarrollos');
    const { data: intent } = await supabaseServer.from('intent_configurations').insert({
      scope_id: ROOT_SCOPE_ID, intent_name: `resumen_${suffix}`, display_name: 'Resumen',
      keywords: [`resumen${suffix}`], synonyms: [], typos: [], phrases: [],
      is_active: true, is_checkpoint: false, is_strong_signal: false,
    }).select('id').single();
    intentId = intent!.id;

    const malasiaKey = normalizeScopeAlias(`Malasia Residencial ${suffix}`).replace(/\s+/g, '_');
    await supabaseServer.from('bot_responses').insert({
      intent_id: intent!.id,
      response_key: `resumen_${suffix}`,
      message_text: `Europa desde {${europaKey}} y Malasia desde {${malasiaKey}.precio}.`,
      response_type: 'simple', order_priority: 1, is_active: true, origin: 'manual',
    });

    const [fromRoot] = await conversationRepository.getBotResponses(intent!.id, {}, ROOT_SCOPE_ID);
    assert(
      fromRoot === 'Europa desde $700,000 y Malasia desde $850,000.',
      `el negocio cita los dos precios: "${fromRoot}"`
    );

    console.log('\n3. Se resuelve igual desde cualquier alcance: no depende de la herencia');
    const [fromEuropa] = await conversationRepository.getBotResponses(intent!.id, {}, europa.id);
    assert(fromEuropa === fromRoot, 'leido desde Europa, dice exactamente lo mismo');

    console.log('\n4. Un dato que solo tiene un desarrollo tambien se puede citar desde fuera');
    await supabaseServer.from('bot_responses')
      .update({ message_text: `La compra minima de Malasia es {${malasiaKey}.compra_minima}.` })
      .eq('intent_id', intent!.id);
    const [minimum] = await conversationRepository.getBotResponses(intent!.id, {}, ROOT_SCOPE_ID);
    assert(
      minimum === 'La compra minima de Malasia es 5 lotes.',
      `desde el negocio, sin heredarlo: "${minimum}"`
    );

    console.log('\n5. Sin cualificar, el dato sigue saliendo de donde esta la conversacion');
    await supabaseServer.from('bot_responses')
      .update({ message_text: 'El precio es {precio}.' })
      .eq('intent_id', intent!.id);
    const [plainEuropa] = await conversationRepository.getBotResponses(intent!.id, {}, europa.id);
    const [plainMalasia] = await conversationRepository.getBotResponses(intent!.id, {}, malasia.id);
    assert(plainEuropa === 'El precio es $700,000.', 'desde Europa, el suyo');
    assert(plainMalasia === 'El precio es $850,000.', 'desde Malasia, el suyo');

    console.log('\n6. Citar un alcance que no existe no inventa nada');
    await supabaseServer.from('bot_responses')
      .update({ message_text: 'Cuesta {inexistente.precio}.' })
      .eq('intent_id', intent!.id);
    const none = await conversationRepository.getBotResponses(intent!.id, {}, ROOT_SCOPE_ID);
    assert(none.length === 0, 'la respuesta no se envia, en vez de salir con el hueco a la vista');
  } finally {
    if (intentId) {
      await supabaseServer.from('bot_responses').delete().eq('intent_id', intentId);
      await supabaseServer.from('intent_configurations').delete().eq('id', intentId);
    }
    for (const id of scopeIds.reverse()) {
      await supabaseServer.from('catalog_values').delete().eq('scope_id', id);
      await supabaseServer.from('scope_aliases').delete().eq('scope_id', id);
      await supabaseServer.from('scopes').delete().eq('id', id);
    }
    scopeRepository.invalidateCache();
  }
}

main()
  .then(() => console.log('\nReferencias verificadas: el dato se cita desde donde sea, sin herencia'))
  .catch(error => { console.error(error); process.exit(1); });
