/**
 * Script para verificar mensajes personalizables en bot_config
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

// Cargar .env.local explícitamente
config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Faltan variables de entorno de Supabase');
  console.error('Asegúrate de que .env.local tiene NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyMessages() {
  console.log('🔍 Verificando mensajes personalizables en bot_config...\n');

  const { data: messages, error } = await supabase
    .from('bot_config')
    .select('category, config_key, config_value')
    .in('category', ['system_messages', 'fallback_messages', 'appointment_messages', 'derivation_messages'])
    .order('category')
    .order('config_key');

  if (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  if (!messages || messages.length === 0) {
    console.log('⚠️ No se encontraron mensajes. Ejecuta la migración 010.');
    process.exit(1);
  }

  console.log(`✅ Se encontraron ${messages.length} mensajes configurables:\n`);

  let currentCategory = '';
  messages.forEach((msg) => {
    if (msg.category !== currentCategory) {
      currentCategory = msg.category;
      console.log(`\n📁 ${currentCategory.toUpperCase()}`);
      console.log('─'.repeat(60));
    }
    
    const preview = msg.config_value.length > 50 
      ? msg.config_value.substring(0, 50) + '...'
      : msg.config_value;
    
    console.log(`  ${msg.config_key}:`);
    console.log(`    "${preview}"`);
  });

  console.log('\n✅ Verificación completada');
  process.exit(0);
}

verifyMessages();
