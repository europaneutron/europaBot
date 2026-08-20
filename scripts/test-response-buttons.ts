/**
 * Botones escritos a mano en una respuesta.
 *
 * Lo que hay que comprobar no es que se guarden, sino que manden: cuando una
 * respuesta declara los suyos, el sistema deja de componerlos, y el toque
 * resuelve la pregunta encadenada sin pasar por el matcher.
 *
 *   npx tsx scripts/test-response-buttons.ts
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
  const { conversationRepository } = await import('../src/data/repositories/conversation.repository');

  const suffix = randomUUID().slice(0, 8);
  const intentIds: string[] = [];
  const scopeIds: string[] = [];

  const createIntent = async (name: string, keywords: string[]) => {
    const { data, error } = await supabaseServer
      .from('intent_configurations')
      .insert({
        scope_id: ROOT_SCOPE_ID,
        intent_name: name,
        display_name: name,
        keywords,
        synonyms: [], typos: [], phrases: [],
        is_active: true, is_checkpoint: false, is_strong_signal: false,
      })
      .select('id')
      .single();
    if (error) throw error;
    intentIds.push(data.id);
    return data.id as string;
  };

  try {
    const financiamiento = await createIntent(`financiamiento_${suffix}`, [`financiamiento${suffix}`]);
    await createIntent(`amenidades_${suffix}`, [`amenidades${suffix}`]);

    console.log('\n1. Sin botones escritos, la respuesta no declara ninguno');
    const { data: response, error: responseError } = await supabaseServer
      .from('bot_responses')
      .insert({
        intent_id: financiamiento,
        response_key: `financiamiento_${suffix}`,
        message_text: 'Aceptamos varias formas de pago.',
        response_type: 'simple',
        order_priority: 1,
        is_active: true,
        origin: 'manual',
      })
      .select('id')
      .single();
    if (responseError) throw responseError;
    assert(
      (await conversationRepository.getResponseButtons(financiamiento)) === null,
      'sin declararlos, el sistema los compone: la respuesta no aporta ninguno'
    );

    console.log('\n2. Escritos a mano, la respuesta los declara tal cual');
    await supabaseServer
      .from('bot_responses')
      .update({
        buttons: [
          { label: 'Amenidades', intentName: `amenidades_${suffix}` },
          { label: 'Agendar visita', intentName: 'cita' },
        ],
      })
      .eq('id', response.id);

    const declared = await conversationRepository.getResponseButtons(financiamiento);
    assert(declared?.length === 2, `devuelve los dos botones: ${JSON.stringify(declared)}`);
    assert(declared![0].label === 'Amenidades', 'conserva el orden en que se escribieron');
    assert(declared![1].intentName === 'cita', 'el flujo de cita se encadena como cualquier otro');

    console.log('\n3. Hasta diez, no tres: la base solo rechaza lo que ningun formato admite');
    // Cuatro o mas se manda como lista, no como botones: ya no hay motivo
    // para rechazarlos. El limite real de WhatsApp es diez.
    const four = await supabaseServer
      .from('bot_responses')
      .update({
        buttons: [
          { label: 'Uno', intentName: 'a' },
          { label: 'Dos', intentName: 'b' },
          { label: 'Tres', intentName: 'c' },
          { label: 'Cuatro', intentName: 'd' },
        ],
      })
      .eq('id', response.id);
    assert(four.error === null, `cuatro opciones si se guardan, para mandarse como lista: ${four.error?.message}`);

    const eleven = await supabaseServer
      .from('bot_responses')
      .update({
        buttons: Array.from({ length: 11 }, (_, i) => ({ label: `Opcion ${i}`, intentName: `x${i}` })),
      })
      .eq('id', response.id);
    assert(eleven.error !== null, 'once opciones no se guardan: WhatsApp admite diez como maximo en una lista');

    const tooLong = await supabaseServer
      .from('bot_responses')
      .update({ buttons: [{ label: 'Terreno y construccion completa y', intentName: 'a' }] })
      .eq('id', response.id);
    assert(tooLong.error !== null, 'una etiqueta de mas de veinticuatro caracteres no se guarda ni como lista');

    const fitsAsList = await supabaseServer
      .from('bot_responses')
      .update({ buttons: [{ label: 'Terreno y construccion', intentName: 'a', description: 'Detalle que solo se ve en la lista' }] })
      .eq('id', response.id);
    assert(fitsAsList.error === null, `una etiqueta de veintidos con descripcion si se guarda: ${fitsAsList.error?.message}`);

    const longDescription = await supabaseServer
      .from('bot_responses')
      .update({ buttons: [{ label: 'Amenidades', intentName: 'a', description: 'x'.repeat(73) }] })
      .eq('id', response.id);
    assert(longDescription.error !== null, 'una descripcion de mas de setenta y dos caracteres no se guarda');

    await supabaseServer
      .from('bot_responses')
      .update({
        buttons: [
          { label: 'Amenidades', intentName: `amenidades_${suffix}` },
          { label: 'Agendar visita', intentName: 'cita' },
        ],
      })
      .eq('id', response.id);
    const stillThere = await conversationRepository.getResponseButtons(financiamiento);
    assert(stillThere?.length === 2, 'y lo que se deja al final es lo que se escribio, sin restos de las pruebas anteriores');

    console.log('\n4. Un boton puede llevar a otro fraccionamiento');
    const { data: europa } = await supabaseServer.from('scopes').insert({
      name: `Europa btn ${suffix}`, slug: `europa-btn-${suffix}`,
      parent_id: ROOT_SCOPE_ID, is_active: true,
    }).select('id').single();
    scopeIds.push(europa!.id);

    await supabaseServer
      .from('bot_responses')
      .update({
        buttons: [
          { label: 'Europa', intentName: `amenidades_${suffix}`, scopeId: europa!.id },
        ],
      })
      .eq('id', response.id);

    const moving = await conversationRepository.getResponseButtons(financiamiento);
    assert(moving?.[0].scopeId === europa!.id, 'el boton declara a que fraccionamiento lleva');

    // Es lo mismo que compone el runtime: el identificador lleva el alcance de
    // destino, y tocarlo fija el foco ahi antes de contestar.
    const optionId = `intent:${moving![0].intentName}:${moving![0].scopeId}`;
    assert(
      optionId.endsWith(europa!.id),
      `el identificador del toque lleva el alcance de destino: ${optionId}`
    );

    await supabaseServer
      .from('bot_responses')
      .update({
        buttons: [
          { label: 'Amenidades', intentName: `amenidades_${suffix}` },
          { label: 'Agendar visita', intentName: 'cita' },
        ],
      })
      .eq('id', response.id);
    const staying = await conversationRepository.getResponseButtons(financiamiento);
    assert(
      staying?.every(button => button.scopeId === null),
      'sin declararlo, el boton contesta donde ya esta la conversacion'
    );

    console.log('\n5. Una respuesta inactiva no aporta sus botones');
    await supabaseServer.from('bot_responses').update({ is_active: false }).eq('id', response.id);
    assert(
      (await conversationRepository.getResponseButtons(financiamiento)) === null,
      'la respuesta apagada deja de declarar botones, como deja de contestar'
    );
    await supabaseServer.from('bot_responses').update({ is_active: true }).eq('id', response.id);

    console.log('\n6. Con cuatro o mas, el turno las manda como lista, con su descripcion');
    // No hay un interruptor para elegir el formato: lo decide sola la
    // cantidad de opciones, exactamente igual que la desambiguacion
    // automatica. Se prueba el camino entero -- boton escrito a mano hasta
    // la presentacion que arma el webhook -- para no quedarse solo en que la
    // fila se guarda.
    const { messageProcessor } = await import('../src/core/conversation/message-processor');
    const { userRepository } = await import('../src/data/repositories/user.repository');
    const { currentOfferPresentation } = await import('../src/core/conversation/pending-offer-messages');

    await supabaseServer
      .from('bot_responses')
      .update({
        buttons: [
          { label: `Amenidades${suffix}`, intentName: `amenidades_${suffix}`, description: 'Alberca, gimnasio y área de asadores' },
          { label: 'Agendar visita', intentName: 'cita' },
          { label: 'Créditos', intentName: `amenidades_${suffix}`, description: 'Infonavit, Fovissste y bancario' },
          { label: 'Ubicación', intentName: `amenidades_${suffix}` },
        ],
      })
      .eq('id', response.id);

    const phone = `rb${suffix}`;
    const detected = await messageProcessor.processMessage(phone, `financiamiento${suffix}`, `rb1-${suffix}`, 'Test');
    assert(!detected.isFallback, `la pregunta debe detectarse: ${JSON.stringify(detected)}`);

    const userId = (await supabaseServer.from('users').select('id').eq('phone_number', phone).single()).data!.id;
    const presentation = await currentOfferPresentation(userId, String(detected.responses[0]));
    assert(presentation?.format === 'list', `con cuatro opciones se presenta como lista: ${JSON.stringify(presentation)}`);
    if (presentation?.format === 'list') {
      assert(presentation.rows.length === 4, `las cuatro opciones llegan completas: ${JSON.stringify(presentation.rows)}`);
      const withDescription = presentation.rows.find(row => row.title.includes('Amenidades'));
      assert(
        withDescription?.description === 'Alberca, gimnasio y área de asadores',
        `la descripcion de la fila con descripcion llega intacta: ${JSON.stringify(withDescription)}`
      );
      const withoutDescription = presentation.rows.find(row => row.title === 'Ubicación');
      assert(
        withoutDescription?.description === undefined,
        `la fila sin descripcion no inventa una: ${JSON.stringify(withoutDescription)}`
      );
    }

    for (const table of ['conversations', 'user_scope_progress', 'appointments', 'followup_messages', 'user_sessions']) {
      await supabaseServer.from(table).delete().eq('user_id', userId);
    }
    await supabaseServer.from('users').delete().eq('id', userId);
  } finally {
    for (const id of intentIds) {
      await supabaseServer.from('bot_responses').delete().eq('intent_id', id);
      await supabaseServer.from('intent_configurations').delete().eq('id', id);
    }
    for (const id of scopeIds.reverse()) {
      await supabaseServer.from('scopes').delete().eq('id', id);
    }
    scopeRepository.invalidateCache();
  }
}

main()
  .then(() => console.log('\nBotones escritos a mano verificados: mandan sobre los compuestos'))
  .catch(error => { console.error(error); process.exit(1); });
