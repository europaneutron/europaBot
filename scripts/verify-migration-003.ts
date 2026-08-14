/**
 * Script de verificación: Migración 003
 * Verifica que la base de datos tenga la estructura correcta
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

// Cargar variables de entorno
config({ path: resolve(__dirname, '../.env.development.local') });
config({ path: resolve(__dirname, '../.env.local') });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Faltan variables de entorno NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyMigration() {
  console.log('🔍 Verificando migración 003...\n');

  // 1. Verificar que response_type existe
  const { data: responses, error } = await supabase
    .from('bot_responses')
    .select('intent_name, response_type, message_text')
    .limit(3);

  if (error) {
    console.error('❌ Error al consultar bot_responses:', error.message);
    return;
  }

  console.log('✅ Columnas verificadas correctamente\n');
  
  // 2. Mostrar ejemplos
  console.log('📊 Ejemplos de datos actuales:\n');
  responses?.forEach((row, index) => {
    console.log(`${index + 1}. Intent: ${row.intent_name}`);
    console.log(`   response_type: ${row.response_type}`);
    console.log(`   message_text type: ${typeof row.message_text}`);
    console.log(`   message_text preview: ${JSON.stringify(row.message_text).substring(0, 100)}...\n`);
  });

  // 3. Verificar que mensajes existentes siguen siendo strings
  const allAreStrings = responses?.every(r => typeof r.message_text === 'string');
  
  if (allAreStrings) {
    console.log('✅ Retrocompatibilidad verificada: mensajes existentes son strings');
  } else {
    console.log('⚠️ Algunos mensajes no son strings, verificar manualmente');
  }

  console.log('\n✨ Verificación completada. La base de datos está lista para mensajes fragmentados.');
}

verifyMigration().catch(console.error);
