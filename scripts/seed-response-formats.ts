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
import { RESPONSE_FORMAT_INTENTS, type ResponseFormatIntentName } from './fixtures/response-format-fixtures';

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

const ROOT_SCOPE_ID = '00000000-0000-4000-8000-000000000001';

async function seedIntent(intentName: ResponseFormatIntentName, intentId: string): Promise<string> {
  const { data: existingIntent, error: findError } = await supabase
    .from('intent_configurations')
    .select('id')
    .eq('scope_id', ROOT_SCOPE_ID)
    .eq('intent_name', intentName)
    .maybeSingle();

  if (findError) throw findError;

  const values = {
    intent_name: intentName,
    scope_id: ROOT_SCOPE_ID,
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
  };

  if (existingIntent) {
    const { error } = await supabase
      .from('intent_configurations')
      .update(values)
      .eq('id', existingIntent.id);

    if (error) throw error;
    return existingIntent.id;
  }

  const { data: insertedIntent, error } = await supabase
    .from('intent_configurations')
    .insert({ id: intentId, ...values })
    .select('id')
    .single();

  if (error) throw error;
  return insertedIntent.id;
}

async function seedResponse(intentId: string, data: Record<string, unknown>) {
  await supabase.from('bot_responses').delete().eq('intent_id', intentId).eq('response_key', 'main');

  const { error } = await supabase.from('bot_responses').insert({
    intent_id: intentId,
    response_key: 'main',
    order_priority: 1,
    is_active: true,
    variables: {},
    ...data,
  });

  if (error) throw error;
}

async function main() {
  const intentIds = {} as Record<ResponseFormatIntentName, string>;
  for (const [intentName, intentId] of Object.entries(RESPONSE_FORMAT_INTENTS)) {
    intentIds[intentName as ResponseFormatIntentName] = await seedIntent(
      intentName as ResponseFormatIntentName,
      intentId
    );
  }

  await seedResponse(intentIds.test_fragmented, {
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

  await seedResponse(intentIds.test_simple_media, {
    response_type: 'simple',
    message_text: 'Aqui tienes la fachada de la propiedad.',
    media_url: 'https://127.0.0.1:54921/storage/v1/object/public/bot-media/images/casa.jpg',
  });

  await seedResponse(intentIds.test_simple_text, {
    response_type: 'simple',
    message_text: 'Este es un mensaje de solo texto.',
    media_url: null,
  });

  console.log('Datos de prueba sembrados para:', Object.keys(RESPONSE_FORMAT_INTENTS).join(', '));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error sembrando datos de prueba:', error);
    process.exit(1);
  });
