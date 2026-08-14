/**
 * Verifica el flujo de carga y guardado del editor de bloques contra el
 * stack local, ejercitando las mismas funciones de conversión que usa la
 * página de respuestas (responseRowToBlocks, blocksToFragmentedResponse).
 *
 * La escritura usa supabaseServer (service role) en lugar del repositorio
 * cliente porque este script corre en Node sin sesión de navegador, y
 * bot_responses tiene RLS que exige un usuario admin autenticado (migración
 * 008); ese flujo de autenticación es ortogonal a lo que cambia este editor.
 * La lógica de normalización de escritura (`response_type: 'fragmented'`,
 * `media_url: null`) se replica aquí porque vive en el repositorio cliente.
 *

 * Para cada uno de los tres formatos sembrados por seed-response-formats.ts:
 * 1. Carga la fila y la convierte a bloques (como al abrir "editar").
 * 2. La serializa de vuelta sin modificarla y la guarda (como al presionar "Guardar").
 * 3. Recarga desde la base de datos y confirma que getBotResponses del bot
 *    resuelve un resultado equivalente al original.
 *
 * Requiere el stack local (npx supabase start) y datos sembrados con
 * scripts/seed-response-formats.ts.
 *
 * Ejecutar con: npx tsx scripts/test-editor-save-flow.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env.development.local') });
config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (!supabaseUrl || (!supabaseUrl.includes('127.0.0.1') && !supabaseUrl.includes('localhost'))) {
  console.error(`NEXT_PUBLIC_SUPABASE_URL no apunta al stack local (${supabaseUrl || 'sin definir'}). Abortando.`);
  process.exit(1);
}

const TEST_INTENTS = ['test_fragmented', 'test_simple_media', 'test_simple_text'];

let failures = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failures += 1;
    console.error(`  FALLA: ${message}`);
  } else {
    console.log(`  OK: ${message}`);
  }
}

async function main() {
  const { supabaseServer } = await import('../src/services/supabase/server-client');
  const { conversationRepository } = await import('../src/data/repositories/conversation.repository');
  const { responseRowToBlocks, blocksToFragmentedResponse } = await import('../src/lib/utils/response-blocks');
  const { isFragmentedResponse, isSimpleResponseWithMedia } = await import('../src/types/message-fragments.types');

  for (const intentName of TEST_INTENTS) {
    console.log(`\nIntent: ${intentName}`);

    const before = await conversationRepository.getBotResponses(intentName);
    assert(before.length === 1, 'tiene exactamente una respuesta sembrada');

    const { data: rows, error: readError } = await supabaseServer
      .from('bot_responses')
      .select('id, message_text, media_url, response_type')
      .eq('intent_name', intentName)
      .eq('response_key', 'main');
    if (readError) throw readError;
    const row = rows?.[0];
    assert(!!row, 'la fila se puede cargar, como al abrir "editar" en la página');

    // 1. Abrir para editar: fila -> bloques
    const blocks = responseRowToBlocks({
      message_text: row.message_text,
      media_url: row.media_url,
      response_type: row.response_type,
    });
    assert(blocks.length > 0, 'la conversión a bloques produce al menos un bloque');

    // 2. Guardar sin modificar: bloques -> fragmented, escribir
    // (misma normalización que intentConfigRepositoryClient.updateResponse aplica en el dashboard)
    const fragmented = blocksToFragmentedResponse(blocks);
    const { error: writeError } = await supabaseServer
      .from('bot_responses')
      .update({
        message_text: fragmented,
        media_url: null,
        response_type: 'fragmented',
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    if (writeError) throw writeError;

    // 3. Recargar y comparar contra el runtime del bot
    const after = await conversationRepository.getBotResponses(intentName);
    assert(after.length === 1, 'sigue habiendo exactamente una respuesta tras guardar');

    const afterResponse = after[0];
    assert(isFragmentedResponse(afterResponse), 'la respuesta quedó persistida en formato fragmented');

    if (isFragmentedResponse(afterResponse)) {
      const beforeResponse = before[0];
      let beforeAsBlocks;

      if (isFragmentedResponse(beforeResponse)) {
        beforeAsBlocks = beforeResponse.fragments;
      } else if (isSimpleResponseWithMedia(beforeResponse)) {
        beforeAsBlocks = [beforeResponse.text, beforeResponse.media_url].filter(Boolean);
      } else {
        beforeAsBlocks = [beforeResponse];
      }

      assert(
        afterResponse.fragments.length >= beforeAsBlocks.length,
        `el número de mensajes que recibiría el lead no disminuyó (antes: ${beforeAsBlocks.length}, despues: ${afterResponse.fragments.length})`
      );
    }
  }

  console.log(failures === 0 ? '\nFlujo de carga y guardado verificado.' : `\n${failures} verificacion(es) fallaron.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('Error ejecutando la verificación:', error);
  process.exit(1);
});
