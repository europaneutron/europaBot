import { config } from 'dotenv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

config({ path: resolve(process.cwd(), '.env.development.local') });
config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(supabaseUrl)) {
  throw new Error('Esta prueba escribe datos y solo puede ejecutarse contra Supabase local');
}

async function main() {
  const [
    { supabaseServer },
    { userRepository },
    { conversationSimulatorRepository },
    { messageProcessor },
    { scopeRepository },
    { conversationRepository },
    { nextAppointmentFlowMessage },
  ] = await Promise.all([
    import('../src/services/supabase/server-client'),
    import('../src/data/repositories/user.repository'),
    import('../src/data/repositories/conversation-simulator.repository'),
    import('../src/core/conversation/message-processor'),
    import('../src/data/repositories/scope.repository'),
    import('../src/data/repositories/conversation.repository'),
    import('../src/core/appointment/appointment-flow-messages'),
  ]);
  const suffix = Date.now().toString().slice(-8);
  let restoreOfferMessage: string | null = null;
  const firstPhone = `52991${suffix}`;
  const secondPhone = `52992${suffix}`;
  const adId = `simulator-ad-${suffix}`;

  try {
    const first = await userRepository.findOrCreateSimulatedByPhone(firstPhone, 'Simulado A');
    const second = await userRepository.findOrCreateSimulatedByPhone(secondPhone, 'Simulado B');
    assert.equal(first.is_simulated, true);
    assert.equal(second.is_simulated, true);
    const { error: scoreError } = await supabaseServer
      .from('users')
      .update({ lead_score: 100, lead_status: 'hot' })
      .eq('id', first.id);
    if (scoreError) throw scoreError;

    await userRepository.updateSession(second.id, { pending_scope_message: 'Estado independiente' });
    const { error: conversationError } = await supabaseServer.from('conversations').insert({
      user_id: first.id,
      message_id: `simulator-test-${suffix}`,
      direction: 'inbound',
      message_text: 'Mensaje de prueba',
    });
    if (conversationError) throw conversationError;
    const { error: followupError } = await supabaseServer.from('scheduled_followups').insert({
      user_id: first.id,
      followup_type: 'test',
      delay_hours: 1,
      scheduled_for: new Date(Date.now() + 60_000).toISOString(),
      status: 'pending',
    });
    if (followupError) throw followupError;

    const { data: operationalConversations, error: operationalError } = await supabaseServer
      .from('conversations')
      .select('id, users!inner(is_simulated)')
      .eq('users.is_simulated', false)
      .eq('user_id', first.id);
    if (operationalError) throw operationalError;
    assert.equal(operationalConversations?.length, 0);

    const referralScope = (await scopeRepository.getScopes()).find(scope => scope.is_active && scope.parent_id);
    assert.ok(referralScope, 'Se necesita al menos un alcance activo para probar la procedencia');
    const { error: adError } = await supabaseServer.from('scope_ads').insert({
      ad_id: adId,
      scope_id: referralScope.id,
    });
    if (adError) throw adError;
    const knownReferral = await messageProcessor.processMessage(
      firstPhone,
      'Hola',
      `simulator-known-ad-${suffix}`,
      'Simulado A',
      { referralAdId: adId, suppressExternalMessages: true }
    );
    assert.equal(knownReferral.error, undefined);
    assert.equal((await conversationSimulatorRepository.getDiagnostic(first.id)).scopeId, referralScope.id);
    await conversationSimulatorRepository.reset(firstPhone);
    const unknownReferral = await messageProcessor.processMessage(
      firstPhone,
      'Hola',
      `simulator-unknown-ad-${suffix}`,
      'Simulado A',
      { referralAdId: `unknown-${suffix}`, suppressExternalMessages: true }
    );
    assert.equal(unknownReferral.error, undefined);
    const { error: deleteAdError } = await supabaseServer.from('scope_ads').delete().eq('ad_id', adId);
    if (deleteAdError) throw deleteAdError;

    await conversationSimulatorRepository.reset(firstPhone);

    const [firstSession, secondSession, followups, operationalUsers] = await Promise.all([
      userRepository.getSession(first.id),
      userRepository.getSession(second.id),
      supabaseServer.from('scheduled_followups').select('id').eq('user_id', first.id),
      supabaseServer.from('users').select('id').eq('is_simulated', false).in('id', [first.id, second.id]),
    ]);
    assert.equal(firstSession?.pending_scope_message, null);
    assert.equal(secondSession?.pending_scope_message, 'Estado independiente');
    assert.equal(followups.data?.length, 0);
    assert.equal(operationalUsers.data?.length, 0);
    // Los textos del flujo de cita viven en un solo sitio.
    //
    // Estaban escritos en la ruta del webhook y copiados en el repositorio del
    // simulador, y las copias divergieron el mismo dia: la del simulador perdio
    // el emoji inicial y dibujo los botones como texto entre corchetes. Contar
    // apariciones es lo unico que impide que vuelvan a duplicarse.
    const sourceFiles = [
      'src/app/api/webhook/whatsapp/route.ts',
      'src/data/repositories/conversation-simulator.repository.ts',
      'src/core/appointment/appointment-flow-messages.ts',
    ].map(file => readFileSync(resolve(process.cwd(), file), 'utf8'));

    for (const literal of ['¿En qué horario prefieres visitarnos?', 'quieres visitarnos el']) {
      const places = sourceFiles.filter(source => source.includes(literal)).length;
      assert.equal(places, 1, `"${literal}" aparece en ${places} archivos; debe vivir en uno solo`);
    }

    // La regla de no repetir sobrevive a que el mensaje se configure.
    //
    // La version anterior buscaba un fragmento del texto por defecto, asi que
    // en cuanto un cliente editaba el auto-offer dejaba de reconocerlo y el bot
    // lo mandaba dos veces.
    const customOffer = `Oferta configurada ${suffix}`;
    // `bot_config` es configuracion compartida, no datos de esta prueba: lo que
    // se escriba aqui sale por el bot hasta que alguien lo note. Paso: este
    // mismo valor aparecio en el simulador durante un recorrido manual, con el
    // sufijo de la prueba a la vista. Se guarda el original y se restaura en el
    // finally, pase lo que pase.
    const { data: previousOffer } = await supabaseServer
      .from('bot_config').select('config_value').eq('config_key', 'auto_offer_message').maybeSingle();
    restoreOfferMessage = previousOffer?.config_value ?? null;
    await supabaseServer.from('bot_config')
      .upsert({ config_key: 'auto_offer_message', config_value: customOffer }, { onConflict: 'config_key' });
    await userRepository.updateAppointmentFlowState(first.id, 'pending_auto_offer');
    const offered = await nextAppointmentFlowMessage(first.id);
    assert.equal(offered?.bodyText, customOffer);
    await conversationRepository.saveOutgoingMessage(first.id, customOffer, false);
    const repeated = await nextAppointmentFlowMessage(first.id);
    assert.equal(repeated, null, 'un auto-offer configurado no debe repetirse');

    console.log('Simulador verificado: marca explícita, aislamiento, reinicio sin seguimientos y mensajes de flujo sin duplicar');
  } finally {
    if (restoreOfferMessage !== null) {
      const { error } = await supabaseServer
        .from('bot_config')
        .update({ config_value: restoreOfferMessage })
        .eq('config_key', 'auto_offer_message');
      if (error) console.error('No se pudo restaurar auto_offer_message:', error.message);
    }
    await supabaseServer.from('scope_ads').delete().eq('ad_id', adId);
    const { data: users } = await supabaseServer
      .from('users')
      .select('id')
      .in('phone_number', [firstPhone, secondPhone]);
    const userIds = (users || []).map(user => user.id);
    if (userIds.length > 0) {
      const { error } = await supabaseServer.from('users').delete().in('id', userIds);
      if (error) throw error;
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
