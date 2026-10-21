/**
 * Prueba del contestador con IA contra el contenido que ya hay en la base local
 * (copia del contenido de producción). No siembra ni modifica contenido: solo crea
 * un usuario desechable con teléfono falso y lo borra al terminar, con sus filas.
 *
 *   npx tsx scripts/test-ai-real-content.ts
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertLocalSupabase } from './helpers/fymsa-fixture';

config({ quiet: true, path: resolve(process.cwd(), '.env.development.local') });
config({ quiet: true, path: resolve(process.cwd(), '.env.local') });

const TURNS = [
  'Hola',
  '¿Cuánto cuesta un lote?',
  '¿y una casa?',
  '¿dónde está?',
  'me mandas el brochure?',
  '¿aceptan Infonavit?',
  '¿tienen promociones?',
  'quiero ir a verlo el sábado',
];

function describe(item: unknown): { text: string; documents: string[] } {
  if (typeof item === 'string') return { text: item, documents: [] };
  if (!item || typeof item !== 'object') return { text: JSON.stringify(item), documents: [] };
  const row = item as { text?: string | null; media_url?: string; media_type?: string; fragments?: Array<Record<string, unknown>> };
  if (Array.isArray(row.fragments)) {
    return {
      text: row.fragments.map(fragment => fragment.type === 'text' ? String(fragment.content)
        : `[${fragment.type}: ${String(fragment.filename ?? fragment.url)}]`).join('\n'),
      documents: row.fragments.filter(fragment => fragment.type === 'document').map(fragment => String(fragment.filename)),
    };
  }
  return {
    text: `${row.text ?? ''}${row.media_url ? ` [${row.media_type}: ${row.media_url}]` : ''}`.trim(),
    documents: row.media_type === 'document' ? [String(row.media_url)] : [],
  };
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
  const { supabaseServer } = await import('../src/services/supabase/server-client');

  const phone = `52999${Date.now().toString().slice(-7)}`;
  const suffix = randomUUID().slice(0, 6);
  const failures: string[] = [];
  let userId: string | null = null;
  try {
    const context = await buildAiContext();
    console.log(`Contexto: ${context.contextSizeChars} caracteres, ${context.moneyValues.length} cifras de dinero, ${context.excluded.length} respuestas excluidas.`);
    console.log(`Desarrollos: ${context.developments.map(item => `${item.name} (brochure=${item.hasResources}, citas=${item.hasAppointments})`).join('; ')}\n`);
    const user = await userRepository.findOrCreateByPhone(phone, 'Prueba contenido real');
    userId = user.id;

    for (let index = 0; index < TURNS.length; index++) {
      const text = TURNS[index];
      const messageId = `wamid.real-${suffix}-${index}`;
      const result = await handleAiMessage({
        userId: user.id, phoneNumber: phone, messageId, messageText: text,
        facts: { now: new Date(), hasActiveAppointment: false, shouldOfferAppointment: false },
        suppressExternalMessages: true,
      });
      console.log(`Lead  ${text}`);
      let documents: string[] = [];
      if (result.kind === 'response') {
        for (const item of result.response.responses) {
          const { text: reply, documents: found } = describe(item);
          documents = documents.concat(found);
          console.log(`Bot   ${reply.replace(/\n/g, '\n      ')}`);
          const money = checkMoneyAmounts(reply, context.moneyValues);
          if (!money.valid) failures.push(`Turno "${text}": cifras inválidas ${JSON.stringify(money.invalid)}`);
          await conversationRepository.saveOutgoingMessage(user.id, reply);
        }
      } else {
        console.log(`Bot   [${result.kind}${'reason' in result ? `: ${result.reason}` : ''}]`);
        failures.push(`Turno "${text}": ${result.kind === 'fallback' ? `respaldo (${result.reason})` : 'duplicado'}`);
        if (result.kind === 'fallback') await conversationRepository.saveIncomingMessage(user.id, messageId, text);
      }
      console.log(`      documento devuelto: ${documents.length ? documents.join(', ') : 'no'}`);
      const calls = await aiModelCallRepository.listForMessage(messageId);
      for (const call of calls) {
        console.log(`      [${call.model} in=${call.input_tokens} cache_read=${call.cache_read_input_tokens} cache_write=${call.cache_creation_input_tokens} out=${call.output_tokens} ${call.latency_ms}ms tools=${JSON.stringify(call.tools_called)} guards=${JSON.stringify(call.guards_applied)} fallback=${call.fallback_reason ?? 'no'}]`);
        if (call.fallback_reason) failures.push(`Turno "${text}": respaldo registrado (${call.fallback_reason})`);
      }
      if (!calls.length) failures.push(`Turno "${text}": sin registro en ai_model_calls`);
      console.log('');
    }
  } finally {
    // Las tablas con user_id caen en cascada; solo se borra el usuario desechable.
    if (userId) {
      const { error } = await supabaseServer.from('users').delete().eq('id', userId);
      if (error) failures.push(`No se pudo borrar el usuario desechable: ${error.message}`);
      else console.log('Usuario desechable borrado.');
    }
  }
  if (failures.length) {
    console.error('\nFallas:\n- ' + failures.join('\n- '));
    process.exitCode = 1;
  } else {
    console.log('\nContenido real: sin respaldos ni cifras inválidas.');
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
