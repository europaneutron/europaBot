/**
 * Los botones y la lista de una respuesta fragmentada llegan de verdad a
 * WhatsApp.
 *
 * Toda respuesta escrita con el editor de bloques se guarda como
 * fragmentada, botones incluidos. El envio los adjuntaba solo cuando la
 * respuesta era un string plano, asi que cualquier oferta configurada a
 * mano en una respuesta real --que siempre es fragmentada-- quedaba escrita
 * en la base y nunca llegaba al lead.
 *
 * No se llama a la API de WhatsApp de verdad: se sustituyen los metodos de
 * `whatsappSender` por dobles que solo anotan lo que se les pidio mandar.
 * Necesario porque este entorno puede tener credenciales reales cargadas
 * para probar un tunel, y una llamada real mandaria un mensaje de verdad.
 *
 *   npx tsx scripts/test-fragmented-response-offer.ts
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
  const { whatsappSender } = await import('../src/services/whatsapp/message-sender');
  const { sendFragmentedResponse } = await import('../src/core/messaging/send-response');
  const { userRepository } = await import('../src/data/repositories/user.repository');
  const { ROOT_SCOPE_ID, scopeRepository } = await import('../src/data/repositories/scope.repository');

  // Dobles: registran la llamada y no tocan la red. Se restauran al final
  // pase lo que pase, para no dejar el singleton mudo para el resto del
  // proceso.
  const calls: { fn: string; args: any }[] = [];
  const originals = {
    sendFragmentedMessage: whatsappSender.sendFragmentedMessage.bind(whatsappSender),
    sendTextMessage: whatsappSender.sendTextMessage.bind(whatsappSender),
    sendInteractiveButtons: whatsappSender.sendInteractiveButtons.bind(whatsappSender),
    sendListMessage: whatsappSender.sendListMessage.bind(whatsappSender),
  };
  (whatsappSender as any).sendFragmentedMessage = async (to: string, fragments: any[]) => {
    calls.push({ fn: 'sendFragmentedMessage', args: { to, fragments } });
    return fragments.map(() => 'fake-id');
  };
  (whatsappSender as any).sendTextMessage = async (params: any) => {
    calls.push({ fn: 'sendTextMessage', args: params });
    return { messageId: 'fake-id' };
  };
  (whatsappSender as any).sendInteractiveButtons = async (params: any) => {
    calls.push({ fn: 'sendInteractiveButtons', args: params });
    return { messageId: 'fake-id' };
  };
  (whatsappSender as any).sendListMessage = async (params: any) => {
    calls.push({ fn: 'sendListMessage', args: params });
    return { messageId: 'fake-id' };
  };

  const suffix = Date.now().toString(36);
  const phone = `fr${suffix}`;
  const createdIntents: string[] = [];

  const content = async (intentName: string, keywords: string[], text: string, buttons?: any[]) => {
    const { data, error } = await supabaseServer.from('intent_configurations').insert({
      intent_name: intentName, display_name: intentName, scope_id: ROOT_SCOPE_ID,
      keywords, synonyms: [], typos: [], phrases: [], priority: 10, is_active: true,
    }).select('id').single();
    if (error) throw error;
    createdIntents.push(data.id);
    await supabaseServer.from('bot_responses').insert({
      intent_id: data.id, response_key: 'main', response_type: 'fragmented',
      message_text: { fragments: [{ type: 'text', delay: 0, content: text }] },
      is_active: true, order_priority: 1,
      ...(buttons ? { buttons } : {}),
    });
  };

  try {
    // --- Caso 1: fragmentada con dos botones (formato botones).
    await content(`fr_two_${suffix}`, [`dosopciones${suffix}`], 'Elige una', [
      { label: 'Uno', intentName: 'a' },
      { label: 'Dos', intentName: 'b' },
    ]);

    // --- Caso 2: fragmentada con cinco opciones (formato lista).
    await content(`fr_five_${suffix}`, [`cincoopciones${suffix}`], 'Elige una de cinco', [
      { label: 'Uno', intentName: 'a', description: 'la primera' },
      { label: 'Dos', intentName: 'b' },
      { label: 'Tres', intentName: 'c' },
      { label: 'Cuatro', intentName: 'd' },
      { label: 'Cinco', intentName: 'e' },
    ]);

    const { scopeRepository: sr } = await import('../src/data/repositories/scope.repository');
    sr.invalidateCache();
    const { intentDetectionService } = await import('../src/core/intent-engine/intent-detection.service');
    intentDetectionService.invalidateAll();

    const { messageProcessor } = await import('../src/core/conversation/message-processor');

    // Caso 1
    calls.length = 0;
    const turn1 = await messageProcessor.processMessage(phone, `dosopciones${suffix}`, `f1-${suffix}`, 'Test');
    assert(!turn1.isFallback, `debe detectarse (caso botones): ${JSON.stringify(turn1)}`);
    const userId = (await supabaseServer.from('users').select('id').eq('phone_number', phone).single()).data!.id;
    await sendFragmentedResponse('521234567890', userId, (turn1.responses[0] as any).fragments);
    assert(
      calls.some(c => c.fn === 'sendInteractiveButtons'),
      `una fragmentada con dos opciones debe adjuntar botones de verdad: ${JSON.stringify(calls)}`
    );
    assert(
      !calls.some(c => c.fn === 'sendTextMessage' && c.args.message === 'Elige una'),
      'el texto del ultimo fragmento no debe mandarse plano cuando hay oferta: se manda con los botones colgados'
    );

    // Caso 2
    calls.length = 0;
    const turn2 = await messageProcessor.processMessage(phone, `cincoopciones${suffix}`, `f2-${suffix}`, 'Test');
    assert(!turn2.isFallback, `debe detectarse (caso lista): ${JSON.stringify(turn2)}`);
    await sendFragmentedResponse('521234567890', userId, (turn2.responses[0] as any).fragments);
    const listCall = calls.find(c => c.fn === 'sendListMessage');
    assert(listCall, `una fragmentada con cinco opciones debe adjuntar una lista de verdad: ${JSON.stringify(calls)}`);
    assert(
      listCall!.args.rows.length === 5,
      `las cinco filas deben llegar completas: ${JSON.stringify(listCall!.args.rows)}`
    );
    assert(
      listCall!.args.rows[0].description === 'la primera',
      `la descripcion configurada llega intacta: ${JSON.stringify(listCall!.args.rows[0])}`
    );

    // --- Caso 3: fragmentada que termina en un fragmento que no es texto no
    // adjunta nada -- no hay donde colgar los botones.
    calls.length = 0;
    await sendFragmentedResponse('521234567890', userId, [
      { type: 'text', delay: 0, content: 'Aquí va la foto' },
      { type: 'image', delay: 0, url: 'https://example.com/x.jpg' },
    ]);
    assert(
      calls.length === 1 && calls[0].fn === 'sendFragmentedMessage',
      `sin texto al final se manda tal cual, sin intentar adjuntar nada: ${JSON.stringify(calls)}`
    );

    for (const table of ['conversations', 'user_scope_progress', 'appointments', 'followup_messages', 'user_sessions']) {
      await supabaseServer.from(table).delete().eq('user_id', userId);
    }
    await supabaseServer.from('users').delete().eq('id', userId);

    console.log('Fragmented response offer verification passed');
  } finally {
    Object.assign(whatsappSender, originals);
    for (const id of createdIntents) {
      await supabaseServer.from('bot_responses').delete().eq('intent_id', id);
      await supabaseServer.from('intent_configurations').delete().eq('id', id);
    }
    scopeRepository.invalidateCache();
    void userRepository;
  }
}

main().catch(error => {
  console.error('Fragmented response offer verification failed:', error);
  process.exit(1);
});
