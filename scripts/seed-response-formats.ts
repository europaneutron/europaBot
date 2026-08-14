/**
 * Siembra datos de prueba para verificar los tres formatos de respuesta
 * (fragmentado, simple con media_url, simple de solo texto) en el stack local.
 *
 * Crea un intent y una respuesta por formato, idempotente por intent_name.
 * Requiere el stack local (npx supabase start).
 *
 * Ejecutar con: npx tsx scripts/seed-response-formats.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env.development.local') });
config({ path: resolve(__dirname, '../.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Faltan variables de entorno de Supabase');
  process.exit(1);
}

if (!supabaseUrl.includes('127.0.0.1') && !supabaseUrl.includes('localhost')) {
  console.error(`NEXT_PUBLIC_SUPABASE_URL no apunta al stack local (${supabaseUrl}). Abortando.`);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const INTENTS = ['test_fragmented', 'test_simple_media', 'test_simple_text'];

async function seedIntent(intentName: string) {
  const { error } = await supabase
    .from('intent_configurations')
    .upsert(
      {
        intent_name: intentName,
        display_name: `Prueba: ${intentName}`,
        keywords: [intentName],
        synonyms: [],
        typos: [],
        phrases: [],
        min_confidence: 0.75,
        priority: 0,
        response_type: 'text',
        is_active: true,
        is_checkpoint: false,
      },
      { onConflict: 'intent_name' }
    );

  if (error) throw error;
}

async function seedResponse(intentName: string, data: Record<string, unknown>) {
  await supabase.from('bot_responses').delete().eq('intent_name', intentName).eq('response_key', 'main');

  const { error } = await supabase.from('bot_responses').insert({
    intent_name: intentName,
    response_key: 'main',
    order_priority: 1,
    is_active: true,
    variables: {},
    ...data,
  });

  if (error) throw error;
}

async function main() {
  for (const intentName of INTENTS) {
    await seedIntent(intentName);
  }

  await seedResponse('test_fragmented', {
    response_type: 'fragmented',
    message_text: {
      fragments: [
        { type: 'text', content: 'Hola, aqui tienes la informacion.', delay: 0 },
        {
          type: 'image',
          url: 'https://127.0.0.1:54921/storage/v1/object/public/bot-media/images/casa.jpg',
          caption: 'Fachada',
          delay: 1200,
        },
        {
          type: 'document',
          url: 'https://127.0.0.1:54921/storage/v1/object/public/bot-media/documents/ficha.pdf',
          filename: 'ficha.pdf',
          delay: 800,
        },
      ],
    },
    media_url: null,
  });

  await seedResponse('test_simple_media', {
    response_type: 'simple',
    message_text: 'Aqui tienes la fachada de la propiedad.',
    media_url: 'https://127.0.0.1:54921/storage/v1/object/public/bot-media/images/casa.jpg',
  });

  await seedResponse('test_simple_text', {
    response_type: 'simple',
    message_text: 'Este es un mensaje de solo texto.',
    media_url: null,
  });

  console.log('Datos de prueba sembrados para:', INTENTS.join(', '));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error sembrando datos de prueba:', error);
    process.exit(1);
  });
