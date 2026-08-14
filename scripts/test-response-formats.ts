/**
 * Linea base de getBotResponses antes del editor de bloques
 *
 * Carga respuestas en los tres formatos de lectura (fragmentado, simple con
 * media_url, simple de solo texto) y muestra la salida de getBotResponses,
 * para comparar contra la misma salida despues de tocar el codigo del editor.
 *
 * Requiere el stack local (npx supabase start) y datos sembrados con
 * scripts/test-response-formats.ts --seed o manualmente en bot_responses.
 *
 * Ejecutar con: npx tsx scripts/test-response-formats.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env.development.local') });
config({ path: resolve(__dirname, '../.env.local') });

const TEST_INTENTS = ['test_fragmented', 'test_simple_media', 'test_simple_text'];

async function main() {
  // Import dinámico: el modulo del repositorio valida variables de entorno
  // al cargarse, y las importaciones estáticas de ES modules se resuelven
  // antes de que config() de dotenv corra, aunque aparezcan después en el archivo.
  const { conversationRepository } = await import('../src/data/repositories/conversation.repository');
  const { isFragmentedResponse, isSimpleResponseWithMedia } = await import('../src/types/message-fragments.types');

  console.log('Linea base de getBotResponses (tres formatos)\n');

  for (const intentName of TEST_INTENTS) {
    const responses = await conversationRepository.getBotResponses(intentName);
    console.log(`Intent: ${intentName} (${responses.length} respuesta(s))`);

    if (responses.length === 0) {
      console.log('  Sin respuestas. Sembrar datos de prueba antes de comparar.');
      continue;
    }

    responses.forEach((response, index) => {
      if (isFragmentedResponse(response)) {
        console.log(`  [${index}] fragmented: ${response.fragments.length} fragmento(s)`);
        response.fragments.forEach((fragment, fragmentIndex) => {
          console.log(`      [${fragmentIndex}] ${fragment.type} delay=${fragment.delay}`);
        });
      } else if (isSimpleResponseWithMedia(response)) {
        console.log(`  [${index}] simple con media: texto="${response.text}" media_type=${response.media_type} url=${response.media_url}`);
      } else {
        console.log(`  [${index}] simple de solo texto: "${response}"`);
      }
    });

    console.log(`  JSON: ${JSON.stringify(responses)}\n`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error ejecutando la linea base:', error);
    process.exit(1);
  });
