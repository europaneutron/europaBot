/**
 * El probador de frases: dice cuales entiende el bot y cuales no, corriendo
 * el matcher de verdad.
 *
 * El caso que lo motiva --"donde estan ubicados" contra una pregunta que solo
 * conoce "ubicacion"-- no se puede montar aqui, porque el kit base ya trae
 * "donde" como palabra de `ubicacion` y engancharia por otro lado. Se
 * reproduce con el mismo fallo sobre un tema que el kit no cubre: el lead
 * dice "perro" y la pregunta solo sabe "mascotas". Antes, la unica forma de
 * enterarse era que un lead lo escribiera.
 *
 *   npx tsx scripts/test-phrase-tester.ts
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
  const intentName = `mascotas_${suffix}`;
  let intentId: string | null = null;

  const tryPhrases = async (phrases: string[]) => {
    const results = [];
    for (const phrase of phrases) {
      const detection = await intentDetectionService.detect(phrase, supabaseServer, ROOT_SCOPE_ID);
      results.push({
        phrase,
        detected: detection.intent?.intent_name === intentName,
        confidence: detection.intent?.confidence ?? null,
      });
    }
    return results;
  };

  try {
    const { data: intent, error } = await supabaseServer
      .from('intent_configurations')
      .insert({
        scope_id: ROOT_SCOPE_ID,
        intent_name: intentName,
        display_name: 'Mascotas',
        keywords: ['mascotas', 'mascota'],
        synonyms: ['puedo llevar mascotas'],
        typos: [],
        phrases: ['aceptan mascotas'],
        priority: 90,
        is_active: true,
        is_checkpoint: false,
        is_strong_signal: false,
      })
      .select('id')
      .single();
    if (error) throw error;
    intentId = intent.id;
    scopeRepository.invalidateCache();
    await intentDetectionService.refresh(supabaseServer, ROOT_SCOPE_ID);

    console.log('\n1. El probador enseña lo que el bot sí entiende');
    const [reconocida] = await tryPhrases(['aceptan mascotas']);
    assert(reconocida.detected, `"aceptan mascotas" engancha (${reconocida.confidence})`);

    console.log('\n2. Y sobre todo lo que no: el caso que costo una conversacion real');
    const [perdida] = await tryPhrases(['puedo llevar a mi perro']);
    assert(
      !perdida.detected,
      'antes de tocar el vocabulario, "puedo llevar a mi perro" no engancha'
    );

    console.log('\n3. Se agrega la forma al vocabulario y vuelve a probarse');
    await supabaseServer
      .from('intent_configurations')
      .update({ synonyms: ['puedo llevar mascotas', 'perro', 'puedo llevar a mi perro'] })
      .eq('id', intent.id);
    scopeRepository.invalidateCache();
    await intentDetectionService.refresh(supabaseServer, ROOT_SCOPE_ID);

    const [arreglada] = await tryPhrases(['puedo llevar a mi perro']);
    assert(
      arreglada.detected,
      `con la palabra puesta, ahora engancha (${arreglada.confidence})`
    );

    console.log('\n4. Un lote de frases devuelve una cuenta usable');
    const lote = await tryPhrases([
      'aceptan mascotas',
      'puedo llevar a mi perro',
      'puedo llevar mascotas',
    ]);
    const fallidas = lote.filter(item => !item.detected).map(item => item.phrase);
    assert(
      fallidas.length === 0,
      `con el vocabulario completo, el lote entero engancha: ${JSON.stringify(fallidas)}`
    );
  } finally {
    if (intentId) {
      await supabaseServer.from('bot_responses').delete().eq('intent_id', intentId);
      await supabaseServer.from('intent_configurations').delete().eq('id', intentId);
    }
    scopeRepository.invalidateCache();
    await intentDetectionService.refresh(supabaseServer, ROOT_SCOPE_ID);
  }
}

main()
  .then(() => console.log('\nProbador verificado: enseña lo que no se entiende y confirma el arreglo'))
  .catch(error => { console.error(error); process.exit(1); });
