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
  const { messageProcessor } = await import('../src/core/conversation/message-processor');
  const { intentDetectionService } = await import('../src/core/intent-engine/intent-detection.service');
  const { scopeRepository } = await import('../src/data/repositories/scope.repository');
  const phones: string[] = [];

  intentDetectionService.invalidateAll();
  scopeRepository.invalidateCache();

  const ask = async (message: string, phone = `52199${Math.floor(Math.random() * 900000000)}`) => {
    phones.push(phone);
    return messageProcessor.processMessage(
      phone,
      message,
      `vocabulary_${randomUUID()}`,
      'Matcher Vocabulary',
      { suppressExternalMessages: true }
    );
  };

  try {
    const houses = await ask('que casas manejan');
    assert(
      !houses.isFallback && houses.detectedIntent?.intent_name === 'modelo',
      '"que casas manejan" llega al catálogo compilado'
    );

    // Con dos desarrollos vivos y precio propio en cada rama, el ruteo pregunta
    // de cual antes de contestar: eso no es fallback, es la desambiguacion. La
    // prueba la responde como la responderia el lead y exige el precio despues.
    const pricePhone = `52199${Math.floor(Math.random() * 900000000)}`;
    const generalPrice = await ask('cuanto cuesta', pricePhone);
    assert(
      !generalPrice.isFallback && generalPrice.detectedIntent?.intent_name === 'precio',
      '"cuanto cuesta" detecta precio sin usar el fallback'
    );
    const priceText = JSON.stringify(generalPrice.responses).includes('$')
      ? JSON.stringify(generalPrice.responses)
      : JSON.stringify((await ask('Residencial Europa', pricePhone)).responses);
    assert(
      priceText.includes('$'),
      `"cuanto cuesta" responde con un precio del material; respuesta: ${priceText}`
    );

    const solaraPrice = await ask('precio de Solara');
    const solaraText = JSON.stringify(solaraPrice.responses);
    assert(!solaraPrice.isFallback, '"precio de Solara" no usa el fallback con el foco suelto');
    assert(
      solaraText.includes('2,980,000'),
      `"precio de Solara" responde el precio del modelo; respuesta: ${solaraText}`
    );

    const unsupported = await ask('aceptan mascotas');
    assert(unsupported.isFallback, 'una pregunta ausente del material conserva el fallback');

    const { data: proposals, error } = await supabaseServer
      .from('compiler_proposals')
      .select('matcher_patterns, intent_configurations(intent_name)')
      .eq('approval_status', 'approved');
    if (error) throw error;
    assert(
      (proposals || []).every((proposal: any) => {
        const patterns = proposal.matcher_patterns || {};
        const forms = Object.values(patterns).flatMap(value => Array.isArray(value) ? value : []);
        const intentName = proposal.intent_configurations?.intent_name || '';
        return forms.length > 1 || forms.some(value => value !== intentName);
      }),
      'ninguna respuesta publicada reduce el vocabulario a su nombre'
    );
  } finally {
    for (const phone of phones) {
      const { data: lead } = await supabaseServer.from('users')
        .select('id').eq('phone_number', phone).maybeSingle();
      if (!lead) continue;
      for (const table of ['appointments', 'conversations', 'user_scope_progress', 'user_progress', 'user_sessions', 'user_checkpoints']) {
        await supabaseServer.from(table).delete().eq('user_id', lead.id);
      }
      await supabaseServer.from('users').delete().eq('id', lead.id);
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
