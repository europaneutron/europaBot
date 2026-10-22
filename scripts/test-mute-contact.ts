/**
 * Silenciar contacto: con el bot apagado para un usuario no hay respuesta, fallback,
 * derivación, score ni llamada al modelo, pero el mensaje entrante se guarda una sola vez.
 * Al reactivar, el bot vuelve a contestar.
 *
 * Contra el Supabase local, con un usuario desechable que se borra al terminar. La IA se
 * inyecta encendida y apagada sin tocar `bot_config`; la parte de reactivación con IA
 * se omite sin ANTHROPIC_API_KEY.
 *
 *   npx tsx scripts/test-mute-contact.ts
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

async function main() {
  assertLocalSupabase();
  const { MessageProcessor } = await import('../src/core/conversation/message-processor');
  const { userRepository } = await import('../src/data/repositories/user.repository');
  const { aiModelCallRepository } = await import('../src/data/repositories/ai-model-call.repository');
  const { supabaseServer } = await import('../src/services/supabase/server-client');

  const phone = `52998${Date.now().toString().slice(-7)}`;
  const suffix = randomUUID().slice(0, 6);
  const gateState = { enabled: false };
  const processor = new MessageProcessor({
    settings: async () => ({ enabled: gateState.enabled }),
    appointmentFlowState: userId => userRepository.getAppointmentFlowState(userId),
    awaitingAdvisorName: userId => userRepository.isAwaitingAdvisorName(userId),
  });
  const send = (text: string, id: string) =>
    processor.processMessage(phone, text, id, 'Prueba silencio', { suppressExternalMessages: true });

  const countIncoming = async (messageId: string) => {
    const { count, error } = await supabaseServer.from('conversations')
      .select('id', { count: 'exact', head: true }).eq('message_id', messageId);
    if (error) throw error;
    return count ?? 0;
  };
  const countAll = async (userId: string, direction: 'inbound' | 'outbound') => {
    const { count, error } = await supabaseServer.from('conversations')
      .select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('direction', direction);
    if (error) throw error;
    return count ?? 0;
  };
  const snapshot = async (userId: string) => {
    const [{ data: u }, { data: s }, { count: checkpoints }] = await Promise.all([
      supabaseServer.from('users').select('lead_score, lead_status, last_interaction_at').eq('id', userId).single(),
      supabaseServer.from('user_sessions').select('fallback_attempts, conversation_context').eq('user_id', userId).single(),
      supabaseServer.from('user_checkpoints').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    ]);
    return JSON.stringify({ u, s, checkpoints });
  };
  const { count: advisorsBefore } = await supabaseServer.from('advisor_requests').select('id', { count: 'exact', head: true });

  let userId: string | null = null;
  try {
    const user = await userRepository.findOrCreateByPhone(phone, 'Prueba silencio');
    userId = user.id;

    const adminId = randomUUID();
    await check('setBotActive silencia y guarda motivo, administrador e instante', async () => {
      const status = await userRepository.setBotActive(user.id, false, { reason: 'muted_by_admin', adminId });
      const { data } = await supabaseServer.from('bot_status').select('controlled_by').eq('user_id', user.id).single();
      assert.equal(data?.controlled_by, adminId);
      assert.equal(status.is_active, false);
      assert.equal(status.paused_reason, 'muted_by_admin');
      assert(status.control_started_at);
      assert.equal(await userRepository.isBotActive(user.id), false);
    });

    const before = await snapshot(user.id);
    for (const enabled of [false, true]) {
      gateState.enabled = enabled;
      const label = enabled ? 'IA encendida' : 'IA apagada';
      const texts = ['Hola', 'https://www.facebook.com/watch/?v=123456', 'quiero hablar con un asesor', 'asdfgh qwerty'];
      for (let index = 0; index < texts.length; index++) {
        const text = texts[index];
        const id = `wamid.mute-${suffix}-${enabled ? 'on' : 'off'}-${index}`;
        await check(`${label}: "${text.slice(0, 28)}" sin respuesta, guardado una vez, sin llamadas al modelo`, async () => {
          const result = await send(text, id);
          assert.equal(result.shouldSend, false);
          assert.equal(result.responses.length, 0);
          assert(!result.viaAi && !result.afterSend && !result.isFallback);
          assert.equal(await countIncoming(id), 1);
          assert.equal((await aiModelCallRepository.listForMessage(id)).length, 0);
        });
      }
    }
    await check('silenciado: sin salientes, sin cambios de score, sesión, checkpoints ni actividad, sin solicitudes de asesor', async () => {
      assert.equal(await countAll(user.id, 'outbound'), 0);
      assert.equal(await countAll(user.id, 'inbound'), 8);
      assert.equal(await snapshot(user.id), before);
      const { count } = await supabaseServer.from('advisor_requests').select('id', { count: 'exact', head: true });
      assert.equal(count, advisorsBefore);
    });

    await check('reactivar limpia motivo, administrador e instante', async () => {
      const status = await userRepository.setBotActive(user.id, true);
      assert.equal(status.is_active, true);
      assert.equal(status.paused_reason, null);
      assert.equal(status.control_started_at, null);
      const { data } = await supabaseServer.from('bot_status').select('controlled_by').eq('user_id', user.id).single();
      assert.equal(data?.controlled_by, null);
      assert.equal(await userRepository.isBotActive(user.id), true);
    });

    gateState.enabled = false;
    await check('reactivado, IA apagada: el bot léxico vuelve a contestar y guarda una vez', async () => {
      const id = `wamid.mute-${suffix}-resume-off`;
      const result = await send('Hola', id);
      assert(result.shouldSend && result.responses.length > 0, JSON.stringify(result));
      assert.equal(await countIncoming(id), 1);
    });

    if (process.env.ANTHROPIC_API_KEY) {
      gateState.enabled = true;
      await check('reactivado, IA encendida: vuelve a contestar la IA', async () => {
        const id = `wamid.mute-${suffix}-resume-on`;
        const result = await send('¿Qué desarrollos tienen?', id);
        assert(result.shouldSend && result.responses.length > 0, JSON.stringify(result));
        if (result.afterSend) await result.afterSend;
        assert.equal(await countIncoming(id), 1);
      });
    } else {
      console.log('  omitida: reactivación con IA, falta ANTHROPIC_API_KEY.');
    }
  } finally {
    if (userId) {
      const { error } = await supabaseServer.from('users').delete().eq('id', userId);
      if (error) console.error('No se pudo borrar el usuario desechable:', error.message);
      else console.log('Usuario desechable borrado.');
    }
  }
  if (failed > 0) { console.error(`\n${failed} fallas`); process.exit(1); }
  console.log('\nTodo bien');
}

main().catch(error => { console.error(error); process.exit(1); });
