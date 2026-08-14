/**
 * Prueba el flujo completo de creación en el editor de bloques: componer una
 * respuesta con texto, varias imágenes y un documento, guardarla y
 * recuperarla, tal como haría un administrador desde la página de respuestas.
 *
 * Usa supabaseServer para la escritura por la misma razón que
 * test-editor-save-flow.ts: RLS exige un usuario admin autenticado, ajeno a
 * lo que cambia este editor.
 *
 * Requiere el stack local (npx supabase start) y el intent `test_fragmented`
 * sembrado por seed-response-formats.ts.
 *
 * Ejecutar con: npx tsx scripts/test-editor-create-flow.ts
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
  const {
    createTextBlock,
    createImageBlock,
    createDocumentBlock,
    blocksToFragmentedResponse,
  } = await import('../src/lib/utils/response-blocks');
  const { validateFragmentedResponse, isFragmentedResponse } = await import('../src/types/message-fragments.types');

  const intentName = 'test_fragmented';
  const responseKey = `create_flow_${Date.now()}`;

  // Componer: texto + dos imágenes + un documento (el caso más común del negocio)
  const blocks = [
    { ...createTextBlock(), content: 'Aquí tienes tres fotos de la casa y su ficha.' },
    createImageBlock('https://example.com/storage/images/casa-1.jpg'),
    createImageBlock('https://example.com/storage/images/casa-2.jpg'),
    createDocumentBlock('https://example.com/storage/documents/ficha.pdf', 'ficha.pdf'),
  ];

  console.log(`Componiendo respuesta con ${blocks.length} bloques (1 texto, 2 imágenes, 1 documento)`);

  const fragmented = blocksToFragmentedResponse(blocks);
  assert(validateFragmentedResponse(fragmented), 'la secuencia compuesta pasa validateFragmentedResponse');

  // Guardar (como al presionar "Crear" en la página)
  const { data: created, error: insertError } = await supabaseServer
    .from('bot_responses')
    .insert({
      intent_name: intentName,
      response_key: responseKey,
      message_text: fragmented,
      media_url: null,
      response_type: 'fragmented',
      order_priority: 99,
      is_active: true,
      variables: {},
    })
    .select()
    .single();

  if (insertError) throw insertError;
  assert(!!created?.id, 'la respuesta se crea y devuelve un id');

  try {
    // Recuperar como lo haría el bot en tiempo de conversación
    const responses = await conversationRepository.getBotResponses(intentName);
    const allFragmented = responses.filter(isFragmentedResponse);
    const recovered = allFragmented.find((r) => r.fragments.length === blocks.length);
    assert(!!recovered, 'getBotResponses recupera la respuesta recién creada');

    if (recovered) {
      assert(recovered.fragments.length === 4, 'conserva los 4 bloques');
      assert(recovered.fragments[0].type === 'text', 'el primer bloque sigue siendo el texto');
      assert(recovered.fragments[1].type === 'image' && recovered.fragments[2].type === 'image', 'las dos imágenes se conservan en orden');
      assert(recovered.fragments[3].type === 'document', 'el documento queda al final, como se compuso');
    }
  } finally {
    // Limpieza: no dejar datos de prueba acumulándose
    await supabaseServer.from('bot_responses').delete().eq('id', created.id);
  }

  console.log(failures === 0 ? '\nFlujo de creación verificado.' : `\n${failures} verificacion(es) fallaron.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('Error ejecutando la verificación:', error);
  process.exit(1);
});
