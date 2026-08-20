/**
 * Sin botones propios, la respuesta se manda sola. El sistema ya no
 * compone sugerencias de seguimiento --hasta dos preguntas vivas mas un
 * boton fijo de "Agendar visita"-- al final de cualquier respuesta que no
 * declare las suyas.
 *
 * Con el editor de bloques como unico camino para escribir una respuesta, y
 * los botones editables ahi mismo, esa composicion dejo de ser una ayuda:
 * era exactamente lo contrario de lo que se pidio -- botones que el
 * administrador no puso y no podia quitar sin escribir los suyos.
 *
 *   npx tsx scripts/test-no-automatic-followup-buttons.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.development.local') });
config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!supabaseUrl || !/^http:\/\/(127\.0\.0\.1|localhost):/.test(supabaseUrl)) {
  console.error('NEXT_PUBLIC_SUPABASE_URL must point to the local stack');
  process.exit(1);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const { supabaseServer } = await import('../src/services/supabase/server-client');
  const { messageProcessor } = await import('../src/core/conversation/message-processor');
  const { scopeRepository, ROOT_SCOPE_ID } = await import('../src/data/repositories/scope.repository');
  const { intentDetectionService } = await import('../src/core/intent-engine/intent-detection.service');
  const { userRepository } = await import('../src/data/repositories/user.repository');
  const { offerButtons } = await import('../src/core/conversation/pending-offer-messages');

  const suffix = Date.now().toString(36);
  const phone = `nf${suffix}`;
  const createdIntents: string[] = [];

  const content = async (intentName: string, keywords: string[], text: string, buttons?: any[]) => {
    const { data, error } = await supabaseServer.from('intent_configurations').insert({
      intent_name: intentName, display_name: intentName, scope_id: ROOT_SCOPE_ID,
      keywords, synonyms: [], typos: [], phrases: [], priority: 10, is_active: true,
    }).select('id').single();
    if (error) throw error;
    createdIntents.push(data.id);
    await supabaseServer.from('bot_responses').insert({
      intent_id: data.id, response_key: 'main', response_type: 'simple',
      message_text: text, is_active: true, order_priority: 1,
      ...(buttons ? { buttons } : {}),
    });
  };

  try {
    // Otra pregunta viva en el mismo alcance: antes era candidata a
    // aparecer sola, compuesta, junto a la que se acaba de contestar.
    await content(`nf_other_${suffix}`, [`otradata${suffix}`], 'Otra respuesta cualquiera');

    // La que se contesta, sin botones propios.
    await content(`nf_main_${suffix}`, [`preguntasola${suffix}`], 'Aquí está tu respuesta, sola');

    scopeRepository.invalidateCache();
    intentDetectionService.invalidateAll();

    const turn = await messageProcessor.processMessage(phone, `preguntasola${suffix}`, `nf1-${suffix}`, 'Test');
    assert(!turn.isFallback, `la pregunta debe detectarse: ${JSON.stringify(turn)}`);

    const userId = (await supabaseServer.from('users').select('id').eq('phone_number', phone).single()).data!.id;
    const session = await userRepository.getSession(userId);
    assert(
      !session?.pending_offer_options?.length,
      `sin botones propios no debe quedar ninguna oferta pendiente: ${JSON.stringify(session?.pending_offer_options)}`
    );

    const botones = await offerButtons(userId, 'x');
    assert(
      botones.length === 0,
      `y no debe salir ningun boton compuesto -- ni el de la otra pregunta, ni el de agendar: ${JSON.stringify(botones)}`
    );

    // Con botones propios, esos y solo esos son los que salen: no se les
    // pega nada encima.
    await content(`nf_owned_${suffix}`, [`conbotonpropio${suffix}`], 'Respuesta con un boton', [
      { label: 'Solo este', intentName: `nf_other_${suffix}` },
    ]);
    scopeRepository.invalidateCache();
    intentDetectionService.invalidateAll();

    await messageProcessor.processMessage(phone, `conbotonpropio${suffix}`, `nf2-${suffix}`, 'Test');
    const botonesPropios = await offerButtons(userId, 'x');
    assert(
      botonesPropios.length === 1 && botonesPropios[0].title === 'Solo este',
      `con boton propio, sale exactamente el que se escribio: ${JSON.stringify(botonesPropios)}`
    );

    for (const table of ['conversations', 'user_scope_progress', 'appointments', 'followup_messages', 'user_sessions']) {
      await supabaseServer.from(table).delete().eq('user_id', userId);
    }
    await supabaseServer.from('users').delete().eq('id', userId);

    console.log('No-automatic-followup-buttons verification passed');
  } finally {
    for (const id of createdIntents) {
      await supabaseServer.from('bot_responses').delete().eq('intent_id', id);
      await supabaseServer.from('intent_configurations').delete().eq('id', id);
    }
    scopeRepository.invalidateCache();
    intentDetectionService.invalidateAll();
  }
}

main().catch(error => {
  console.error('No-automatic-followup-buttons verification failed:', error);
  process.exit(1);
});
