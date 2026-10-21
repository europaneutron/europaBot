/**
 * Prueba del contestador con IA contra la API real y el stack local.
 * Siembra FYMSA, corre los turnos por el handler directamente (sin message-processor
 * ni WhatsApp) y muestra respuesta, tokens, caché, latencia y tools de cada llamada.
 *
 *   npx tsx scripts/test-ai-responder.ts
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { assertLocalSupabase, withFymsaFixture } from './helpers/fymsa-fixture';

config({ quiet: true, path: resolve(process.cwd(), '.env.development.local') });
config({ quiet: true, path: resolve(process.cwd(), '.env.local') });

const TURNS = [
  'Hola',
  '¿Cuánto cuestan?',
  'Solara',
  '¿Dónde está?',
  '¿Y en Altabrisa cuánto cuesta?',
  'Quiero agendar',
];

function flatten(responses: unknown[]): string[] {
  return responses.map(item => typeof item === 'string' ? item
    : item && typeof item === 'object' && 'text' in item ? String((item as { text: unknown }).text)
      : JSON.stringify(item));
}

async function main() {
  assertLocalSupabase();
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Falta ANTHROPIC_API_KEY en .env.development.local');
  const { handleAiMessage } = await import('../src/core/ai-conversation/ai-message-handler');
  const { buildAiContext } = await import('../src/core/ai-conversation/context-builder');
  const { checkMoneyAmounts } = await import('../src/core/ai-conversation/guards/money-guard');
  const { aiModelCallRepository } = await import('../src/data/repositories/ai-model-call.repository');
  const { conversationRepository } = await import('../src/data/repositories/conversation.repository');
  const { userRepository } = await import('../src/data/repositories/user.repository');

  const phone = `aitest${Date.now().toString(36)}`;
  const suffix = randomUUID().slice(0, 6);
  const failures: string[] = [];

  await withFymsaFixture(async () => {
    const user = await userRepository.findOrCreateByPhone(phone, 'Prueba IA');
    const context = await buildAiContext();
    console.log(`Contexto: ${context.contextSizeChars} caracteres, ${context.moneyValues.length} cifras de dinero.\n`);

    for (let index = 0; index < TURNS.length; index++) {
      const text = TURNS[index];
      const messageId = `wamid.ai-${suffix}-${index}`;
      const result = await handleAiMessage({
        userId: user.id, phoneNumber: phone, messageId, messageText: text,
        facts: { now: new Date(), hasActiveAppointment: false, shouldOfferAppointment: false },
        suppressExternalMessages: true,
      });
      console.log(`Lead  ${text}`);
      if (result.kind === 'response') {
        const replies = flatten(result.response.responses);
        for (const reply of replies) {
          console.log(`Bot   ${reply.replace(/\n/g, '\n      ')}`);
          const money = checkMoneyAmounts(reply, context.moneyValues);
          if (!money.valid) failures.push(`Turno "${text}": cifras inválidas ${JSON.stringify(money.invalid)}`);
          await conversationRepository.saveOutgoingMessage(user.id, reply);
        }
      } else {
        console.log(`Bot   [${result.kind}${'reason' in result ? `: ${result.reason}` : ''}]`);
        failures.push(`Turno "${text}": ${result.kind === 'fallback' ? `respaldo (${result.reason}${result.errorType ? `, ${result.errorType}` : ''})` : 'duplicado'}`);
        // El respaldo no guarda la entrada aquí; se guarda para que el historial siga completo.
        if (result.kind === 'fallback') await conversationRepository.saveIncomingMessage(user.id, messageId, text);
      }
      const calls = await aiModelCallRepository.listForMessage(messageId);
      for (const call of calls) {
        console.log(`      [${call.model} in=${call.input_tokens} cache_read=${call.cache_read_input_tokens} cache_write=${call.cache_creation_input_tokens} out=${call.output_tokens} ${call.latency_ms}ms tools=${JSON.stringify(call.tools_called.map(t => (t as { name: string }).name))} guards=${call.guards_applied.length} fallback=${call.fallback_reason ?? 'no'}]`);
      }
      assert(calls.length > 0, `El turno "${text}" no dejó registro en ai_model_calls`);
      console.log('');
    }

    const duplicate = await handleAiMessage({
      userId: user.id, phoneNumber: phone, messageId: `wamid.ai-${suffix}-0`, messageText: TURNS[0],
      facts: { now: new Date(), hasActiveAppointment: false, shouldOfferAppointment: false },
      suppressExternalMessages: true,
    });
    console.log(`Reintento del primer message_id: ${duplicate.kind}`);
    if (duplicate.kind !== 'duplicate') failures.push('El reintento del mismo message_id no se detectó como duplicado');
  }, { suffix, phone });

  if (failures.length) {
    console.error('\nFallas:\n- ' + failures.join('\n- '));
    process.exitCode = 1;
  } else {
    console.log('\nContestador con IA: sin respaldos ni cifras inválidas.');
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
