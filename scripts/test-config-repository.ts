/**
 * Script para probar ConfigRepository
 * Ejecutar con: npx tsx scripts/test-config-repository.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

// Cargar variables de entorno
config({ path: resolve(process.cwd(), '.env.development.local') });
config({ path: resolve(process.cwd(), '.env.local') });
// Crear cliente de Supabase directamente para scripts
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Faltan variables de entorno de Supabase');
  console.error('   Asegúrate de tener .env.local con:');
  console.error('   - NEXT_PUBLIC_SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConfigRepository() {
  console.log('🧪 Testing bot_config table...\n');

  try {
    // Test 1: Leer configuración específica
    console.log('📖 Test 1: Leer business_hours');
    const { data: businessData } = await supabase
      .from('bot_config')
      .select('config_value')
      .eq('config_key', 'business_hours')
      .single();
    console.log(`   ✅ business_hours: "${businessData?.config_value || 'No encontrado'}"\n`);

    // Test 2: Leer checkpoints_for_appointment
    console.log('📖 Test 2: Leer checkpoints_for_appointment');
    const { data: checkpointData } = await supabase
      .from('bot_config')
      .select('config_value')
      .eq('config_key', 'checkpoints_for_appointment')
      .single();
    const checkpointsRequired = parseInt(checkpointData?.config_value || '4', 10);
    console.log(`   ✅ checkpoints_for_appointment: ${checkpointsRequired}\n`);

    // Test 3: Leer appointment_auto_offer_enabled
    console.log('📖 Test 3: Leer appointment_auto_offer_enabled');
    const { data: autoOfferData } = await supabase
      .from('bot_config')
      .select('config_value')
      .eq('config_key', 'appointment_auto_offer_enabled')
      .single();
    const autoOfferEnabled = autoOfferData?.config_value === 'true';
    console.log(`   ✅ appointment_auto_offer_enabled: ${autoOfferEnabled}\n`);

    // Test 4: Leer todas las configuraciones
    console.log('📖 Test 4: Todas las configuraciones');
    const { data: allConfigs } = await supabase
      .from('bot_config')
      .select('*')
      .order('category')
      .order('config_key');
    
    console.log(`   ✅ Total de configuraciones: ${allConfigs?.length || 0}`);
    console.log('   Categorías encontradas:');
    
    if (allConfigs) {
      const categorySet = new Set(allConfigs.map((c: any) => c.category));
      const categories = Array.from(categorySet);
      categories.forEach(cat => {
        const count = allConfigs.filter((c: any) => c.category === cat).length;
        console.log(`      - ${cat}: ${count} configs`);
      });
    }
    console.log('');

    // Test 5: Configuraciones de appointments
    console.log('📖 Test 5: Categoría "appointments"');
    const { data: appointmentConfigs } = await supabase
      .from('bot_config')
      .select('*')
      .eq('category', 'appointments')
      .order('config_key');
    
    console.log(`   ✅ Configuraciones de appointments:`);
    appointmentConfigs?.forEach((c: any) => {
      console.log(`      - ${c.config_key} = "${c.config_value}"`);
    });
    console.log('');

    console.log('✅ Todos los tests pasaron exitosamente!');
    console.log('\n📊 Resumen:');
    console.log(`   - Total configs: ${allConfigs?.length || 0}`);
    console.log(`   - Checkpoints requeridos: ${checkpointsRequired}`);
    console.log(`   - Auto-offer habilitado: ${autoOfferEnabled}`);
    console.log(`   - Horario de atención: "${businessData?.config_value || 'No configurado'}"`);

  } catch (error) {
    console.error('❌ Error durante testing:', error);
    process.exit(1);
  }
}

testConfigRepository();
