/**
 * Regresiones de la prueba real en WhatsApp (conversacion-con-ia, seccion 13).
 *
 * Repite por `processMessage` la conversacion que fallo, con el interruptor de la
 * IA inyectado en encendido (no toca `bot_config`), sin enviar nada a WhatsApp
 * (`suppressExternalMessages`) y con un usuario simulado desechable que se borra
 * al terminar. Usa el modelo real: se omite sin ANTHROPIC_API_KEY.
 *
 *   npx tsx scripts/test-whatsapp-regressions.ts
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { assertLocalSupabase } from './helpers/fymsa-fixture';

config({ quiet: true, path: resolve(process.cwd(), '.env.development.local') });
config({ quiet: true, path: resolve(process.cwd(), '.env.local') });

let failed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  try { await fn(); console.log(`  ok  ${name}`); }
  catch (error) { failed++; console.error(`  FALLA ${name}\n       ${error instanceof Error ? error.message : error}`); }
}

function textOf(response: unknown): string {
  if (typeof response === 'string') return response;
  if (response && typeof response === 'object') {
    const value = response as { text?: string; fragments?: Array<{ content?: string }> };
    if (value.fragments) return value.fragments.map(fragment => fragment.content ?? '').join('\n');
    if (value.text) return value.text;
  }
  return '';
}

async function main() {
  assertLocalSupabase();
  console.log('Piezas puras');
  const { validateDecline } = await import('../src/core/ai-conversation/decline-detector');
  const { isCancelReply } = await import('../src/core/fallback/advisor-name-replies');
  await check('el rechazo del modelo cuenta solo con una cita presente en el mensaje', () => {
    assert.equal(validateDecline({ rechaza: true, cita: 'no necesito mas ayuda' }, 'no bro, no necesito más ayuda'), true);
    assert.equal(validateDecline({ rechaza: true, cita: 'ya no quiero nada' }, 'Xochitl Ixchel'), false);
    assert.equal(validateDecline({ rechaza: true, cita: '' }, 'no'), false);
    assert.equal(validateDecline({ rechaza: false, cita: 'no' }, 'no'), false);
    assert.equal(validateDecline('basura', 'no'), false);
  });
  await check('"no", "ya no" y "cancelar" cancelan; un nombre o un texto largo no', () => {
    for (const text of ['no', 'No.', 'ya no', 'Cancelar', 'mejor cancelar', 'no gracias']) assert.equal(isCancelReply(text), true, text);
    for (const text of ['Noé', 'Nora Gómez', 'no bro, no necesito mas ayuda', 'Xochitl', 'sí']) assert.equal(isCancelReply(text), false, text);
  });
  if (!process.env.ANTHROPIC_API_KEY) { console.log('Omitida: falta ANTHROPIC_API_KEY.'); return; }

  const { MessageProcessor } = await import('../src/core/conversation/message-processor');
  const { userRepository } = await import('../src/data/repositories/user.repository');
  const { conversationRepository } = await import('../src/data/repositories/conversation.repository');
  const { fallbackHandler } = await import('../src/core/fallback/fallback-handler');
  const { ROOT_SCOPE_ID } = await import('../src/data/repositories/scope.repository');
  const { formatAppointmentDate } = await import('../src/core/appointment/appointment-text');
  const { supabaseServer } = await import('../src/services/supabase/server-client');

  const suffix = randomUUID().slice(0, 6);
  const phone = `52998${Date.now().toString().slice(-7)}`;
  const gate = { enabled: true };
  const processor = new MessageProcessor({
    settings: async () => ({ enabled: gate.enabled }),
    appointmentFlowState: id => userRepository.getAppointmentFlowState(id),
    awaitingAdvisorName: id => userRepository.isAwaitingAdvisorName(id),
  });

  let counter = 0;
  let userId = '';
  const messageIds: string[] = [];
  // Hace lo que el transporte: el saliente queda en el historial que lee el siguiente turno.
  const say = async (text: string, flowResponse?: Record<string, unknown>) => {
    const id = `wamid.reg-${suffix}-${counter++}`;
    messageIds.push(id);
    const result = await processor.processMessage(phone, text, id, 'Prueba regresiones', { suppressExternalMessages: true, flowResponse });
    if (result.afterSend) await result.afterSend;
    const reply = result.responses.map(textOf).filter(Boolean).join('\n');
    if (reply) await conversationRepository.saveOutgoingMessage(userId, reply);
    console.log(`       Lead: ${text}\n       Bot : ${reply.replace(/\n/g, '\n             ')}`);
    return { id, reply, result };
  };
  const incomingCount = async (messageId: string) => {
    const { count, error } = await supabaseServer.from('conversations').select('id', { count: 'exact', head: true })
      .eq('message_id', messageId).eq('direction', 'inbound');
    if (error) throw error;
    return count ?? 0;
  };
  const session = async () => (await userRepository.getSession(userId))!;
  const advisorRequests = async () => {
    const { count } = await supabaseServer.from('advisor_requests').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    return count ?? 0;
  };

  try {
    const user = await userRepository.findOrCreateSimulatedByPhone(phone, 'Prueba regresiones');
    userId = user.id;

    console.log('\nCita por formulario y lo que la IA sabe de ella');
    const first = await say('Quisiera ir el sábado');
    // El envío del formulario nativo queda fuera de la simulación: se deja el estado que dejaría.
    assert(await userRepository.getAppointmentFlowState(userId), 'la IA no inició el flujo de visita; sin él no hay formulario que repetir');
    await userRepository.updateAppointmentFlowState(userId, 'awaiting_flow');

    const target = new Date();
    target.setHours(0, 0, 0, 0);
    target.setDate(target.getDate() + ((4 - target.getDay() + 7) % 7 || 7));
    const iso = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
    const dateWords = formatAppointmentDate(iso);
    const form = await say('flow', { booking_date: iso, time_slot: 'afternoon', visitor_name: 'Lead de regresión' });

    await check('la confirmación dice la fecha en palabras y las horas, sin "Mañana a las Mediodía"', () => {
      assert(form.reply.includes(`para el ${dateWords}`), form.reply);
      assert(form.reply.includes('de 12:00 a 15:00 h'), form.reply);
      assert(!/el Mañana|el Hoy|a las Mediodía|hrs\)/.test(form.reply), form.reply);
    });
    await check('el historial muestra el formulario como texto legible, no "flow", y una sola vez', async () => {
      const { data } = await supabaseServer.from('conversations').select('message_text').eq('message_id', form.id).eq('direction', 'inbound');
      assert.equal(data?.length, 1);
      assert.equal(data![0].message_text, `[Formulario de cita enviado: ${dateWords}, de 12:00 a 15:00 h, a nombre de Lead de regresión]`);
    });

    const oie = await say('Oie');
    await check('"Oie" no afirma una discrepancia ni ofrece un asesor por la fecha', async () => {
      assert(oie.result.viaAi, 'debió contestar la IA');
      assert(!/no coincide|discrepancia|pediste el s[aá]bado|dice ["'“]?ma[ñn]ana|asesor|s[aá]bado/i.test(oie.reply), oie.reply);
      assert.equal((await session()).awaiting_advisor_name, false);
    });

    const complaint = await say('no esta bien, yo lo elegi pues');
    await check('"no esta bien, yo lo elegi pues" no inicia la derivación', async () => {
      assert.equal((await session()).awaiting_advisor_name, false);
      assert(!/nombre completo/i.test(complaint.reply), complaint.reply);
      assert(!/pediste el s[aá]bado|dijiste que quer[ií]as ir el s[aá]bado|no coincide|discrepancia/i.test(complaint.reply), `la IA no debe contraponer la fecha elegida con la del sábado: ${complaint.reply}`);
      assert.equal(await advisorRequests(), 0);
    });

    // El historial solo trae los últimos mensajes: tras una plática larga la
    // confirmación sale de la ventana. Se reproduce borrando el historial y dejando
    // la cita, que es como quedó la prueba real en la que el modelo dudó de ella.
    console.log('\nCita vigente sin la confirmación a la vista');
    await supabaseServer.from('conversations').delete().eq('user_id', userId);
    messageIds.length = 0;
    const reminder = await say('me recuerdas a que hora es mi cita?');
    await check('con la cita fuera del historial, la da como vigente y no duda de ella', () => {
      assert(reminder.result.viaAi, 'debió contestar la IA');
      assert(reminder.reply.includes(dateWords) && /12:00/.test(reminder.reply), reminder.reply);
      assert(!/no tengo (una )?confirmaci|no quiero darte|corregirme|formalmente/i.test(reminder.reply), reminder.reply);
    });
    const another = await say('quiero agendar otra visita');
    await check('con una cita vigente no se abre un segundo flujo de visita', async () => {
      assert.equal(await userRepository.getAppointmentFlowState(userId), null, 'se inició otro flujo con una cita vigente');
      const { count } = await supabaseServer.from('appointments').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).in('status', ['pending', 'confirmed']);
      assert.equal(count, 1, another.reply);
    });
    void first;

    console.log('\nCaptura del nombre, camino con IA');
    const askAdvisor = await say('mejor sí, pásame con un asesor');
    await check('la derivación que inicia la IA usa su introducción y no el texto léxico de nivel 3', async () => {
      // Que el modelo decida llamar a la tool no es lo que se mide: si no lo hizo, responde el camino
      // léxico y el estado se prepara directo con la misma función que usa la tool.
      const viaTool = askAdvisor.result.viaAi === true && (await session()).awaiting_advisor_name === true;
      if (viaTool) {
        assert(askAdvisor.reply.startsWith('Con gusto te paso con un asesor.'), askAdvisor.reply);
        assert(!askAdvisor.reply.includes('Entiendo que necesitas ayuda más específica'), askAdvisor.reply);
        assert(/nombre completo/.test(askAdvisor.reply), askAdvisor.reply);
      } else {
        await userRepository.updateAwaitingAdvisorName(userId, false);
        const direct = await fallbackHandler.startDerivation(userId, ROOT_SCOPE_ID, { configureButtons: false, source: 'ai' });
        assert(direct.startsWith('Con gusto te paso con un asesor.'), direct);
        assert(!direct.includes('Entiendo que necesitas ayuda más específica'), direct);
        assert(/nombre completo/.test(direct), direct);
        console.log('       (el modelo no llamó a la tool en este turno; se comprobó la función directo)');
      }
    });
    const decline = await say('no bro, no necesito mas ayuda');
    await check('un rechazo claro cancela: no se registra como nombre, se guarda una vez y el estado queda limpio', async () => {
      assert.equal(decline.reply, 'Va, no hay problema. Si después quieres hablar con un asesor, solo dímelo.');
      const row = await session();
      assert.equal(row.awaiting_advisor_name, false);
      assert.equal(row.pending_advisor_name ?? null, null);
      assert.equal(await advisorRequests(), 0);
      assert.equal(await incomingCount(decline.id), 1);
    });

    await fallbackHandler.startDerivation(userId, ROOT_SCOPE_ID, { configureButtons: false, source: 'ai' });
    const uncommon = await say('Xochitl Ixchel');
    await check('un nombre poco común va a confirmación, nunca se registra directo', async () => {
      assert.equal(uncommon.reply, '¿Te registro como "Xochitl Ixchel"? Responde sí, o escribe tu nombre.');
      assert.equal((await session()).pending_advisor_name, 'Xochitl Ixchel');
      assert.equal(await advisorRequests(), 0);
      assert.equal(await incomingCount(uncommon.id), 1);
    });
    const replaced = await say('Mejor Ixchel Pérez');
    await check('un texto nuevo reemplaza al candidato y vuelve a preguntar', async () => {
      assert.equal(replaced.reply, '¿Te registro como "Mejor Ixchel Pérez"? Responde sí, o escribe tu nombre.');
      assert.equal(await incomingCount(replaced.id), 1);
    });
    const yes = await say('sí');
    await check('un sí registra el candidato y sigue como antes', async () => {
      assert(yes.reply.includes('Mejor Ixchel Pérez'), yes.reply);
      assert.equal(await advisorRequests(), 1);
      const row = await session();
      assert.equal(row.awaiting_advisor_name, false);
      assert.equal(row.pending_advisor_name ?? null, null);
      assert.equal(await incomingCount(yes.id), 1);
    });

    console.log('\nCaptura del nombre, camino léxico (IA apagada)');
    gate.enabled = false;
    await supabaseServer.from('advisor_requests').delete().eq('user_id', userId);
    await fallbackHandler.startDerivation(userId, ROOT_SCOPE_ID);
    const lexicalText = await say('no bro, no necesito mas ayuda');
    await check('sin IA no hay detector: el texto largo va a confirmación', async () => {
      assert.equal(lexicalText.reply, '¿Te registro como "no bro, no necesito mas ayuda"? Responde sí, o escribe tu nombre.');
      assert.equal(await advisorRequests(), 0);
    });
    const no = await say('no');
    await check('"no" cancela', async () => {
      assert.equal(no.reply, 'Va, no hay problema. Si después quieres hablar con un asesor, solo dímelo.');
      assert.equal((await session()).awaiting_advisor_name, false);
      assert.equal((await session()).pending_advisor_name ?? null, null);
    });
    await fallbackHandler.startDerivation(userId, ROOT_SCOPE_ID);
    await say('Pedro');
    const cancel = await say('cancelar');
    await check('"cancelar" cancela con un candidato pendiente', async () => {
      assert(cancel.reply.startsWith('Va, no hay problema'), cancel.reply);
      assert.equal(await advisorRequests(), 0);
    });
    await fallbackHandler.startDerivation(userId, ROOT_SCOPE_ID);
    const cancelFirst = await say('Cancelar');
    await check('"cancelar" cancela antes de que haya candidato', () => {
      assert(cancelFirst.reply.startsWith('Va, no hay problema'), cancelFirst.reply);
    });
    const lexicalIntro = await fallbackHandler.startDerivation(userId, ROOT_SCOPE_ID);
    await check('el texto léxico de la derivación no cambió', () => {
      assert(lexicalIntro.startsWith('Entiendo que necesitas ayuda más específica.'), lexicalIntro);
    });
    await userRepository.updateAwaitingAdvisorName(userId, false);

    await check('cada mensaje entrante quedó guardado exactamente una vez', async () => {
      for (const id of messageIds) assert.equal(await incomingCount(id), 1, `${id} guardado ${await incomingCount(id)} veces`);
    });
  } finally {
    if (userId) {
      await supabaseServer.from('advisor_requests').delete().eq('user_id', userId);
      await supabaseServer.from('appointments').delete().eq('user_id', userId);
      const { error } = await supabaseServer.from('users').delete().eq('id', userId);
      if (error) console.error('No se pudo borrar el usuario de prueba:', error.message);
    }
  }
  if (failed) { console.error(`\n${failed} comprobación(es) fallaron`); process.exit(1); }
  console.log('\nRegresiones de WhatsApp: todo bien');
}

main().catch(error => { console.error(error); process.exit(1); });
