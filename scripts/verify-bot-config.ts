/**
 * Script para verificar que la tabla bot_config se creó correctamente
 * y contiene todas las configuraciones iniciales
 */

import { supabaseServer } from '../src/services/supabase/server-client';

async function verifyBotConfig() {
  console.log('🔍 Verificando tabla bot_config...\n');

  try {
    // Obtener todas las configuraciones
    const { data: configs, error } = await supabaseServer
      .from('bot_config')
      .select('*')
      .order('category', { ascending: true })
      .order('config_key', { ascending: true });

    if (error) {
      console.error('❌ Error al consultar bot_config:', error);
      return;
    }

    console.log(`✅ Tabla bot_config encontrada con ${configs.length} configuraciones\n`);

    // Agrupar por categoría
    const byCategory: Record<string, any[]> = {};
    configs.forEach(config => {
      if (!byCategory[config.category]) {
        byCategory[config.category] = [];
      }
      byCategory[config.category].push(config);
    });

    // Mostrar por categoría
    Object.keys(byCategory).sort().forEach(category => {
      console.log(`📋 Categoría: ${category.toUpperCase()}`);
      console.log('─'.repeat(80));
      
      byCategory[category].forEach(config => {
        const editable = config.is_editable ? '✏️' : '🔒';
        console.log(`  ${editable} ${config.config_key}`);
        console.log(`     Valor: ${config.config_value}`);
        console.log(`     Tipo: ${config.config_type}`);
        console.log(`     Descripción: ${config.description}`);
        console.log('');
      });
    });

    // Verificar configuraciones clave
    console.log('\n🎯 Verificando configuraciones clave:');
    console.log('─'.repeat(80));

    const checkpointsRequired = configs.find(c => c.config_key === 'checkpoints_for_appointment');
    const maxCheckpoints = configs.find(c => c.config_key === 'max_checkpoints');
    const checkpointPoints = configs.find(c => c.config_key === 'checkpoint_points');

    console.log(`✅ Checkpoints requeridos para cita: ${checkpointsRequired?.config_value || 'NO ENCONTRADO'}`);
    console.log(`✅ Checkpoints máximos: ${maxCheckpoints?.config_value || 'NO ENCONTRADO'}`);
    console.log(`✅ Puntos por checkpoint: ${checkpointPoints?.config_value || 'NO ENCONTRADO'}`);

    console.log('\n✅ Verificación completada exitosamente!\n');

  } catch (err) {
    console.error('❌ Error inesperado:', err);
  }
}

// Ejecutar verificación
verifyBotConfig().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
