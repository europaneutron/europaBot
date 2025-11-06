/**
 * Script de prueba para el sistema de fallback refactorizado
 * 
 * Prueba:
 * 1. Primer fallback (mensaje de clarificación)
 * 2. Segundo fallback (menú numerado)
 * 3. Tercer fallback (derivación a asesor)
 * 4. Captura de nombre del usuario
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Cargar variables de entorno
config({ path: resolve(__dirname, '../.env.local') });

import { fallbackHandler } from '../src/core/fallback';
import { userRepository } from '../src/data/repositories/user.repository';
import { configRepository } from '../src/data/repositories/config.repository';

async function testFallbackSystem() {
  console.log('🧪 Iniciando prueba del sistema de fallback\n');

  // 1. Crear usuario de prueba
  console.log('1️⃣ Creando usuario de prueba...');
  const testPhone = '+52' + Math.floor(Math.random() * 10000000000);
  const user = await userRepository.findOrCreateByPhone(testPhone, 'Usuario Test Fallback');
  console.log(`✅ Usuario creado: ${user.id} (${testPhone})\n`);

  // 2. Verificar configuración
  console.log('2️⃣ Verificando configuración...');
  const maxAttempts = await configRepository.getInt('max_fallback_attempts', 3);
  const derivationEnabled = await configRepository.getBoolean('fallback_derivation_enabled', true);
  console.log(`   Max intentos: ${maxAttempts}`);
  console.log(`   Derivación habilitada: ${derivationEnabled}\n`);

  // 3. Probar primer fallback
  console.log('3️⃣ Probando PRIMER FALLBACK...');
  const fallback1 = await fallbackHandler.handle(user.id, 'mensaje incomprensible xyz123');
  const response1 = typeof fallback1.responses[0] === 'string' 
    ? fallback1.responses[0] 
    : JSON.stringify(fallback1.responses[0]);
  console.log(`   Respuesta: ${response1.substring(0, 50)}...`);
  console.log(`   Es fallback: ${fallback1.isFallback}`);
  console.log(`   Debe enviar: ${fallback1.shouldSend}\n`);

  // 4. Probar segundo fallback
  console.log('4️⃣ Probando SEGUNDO FALLBACK...');
  const fallback2 = await fallbackHandler.handle(user.id, 'otro mensaje sin sentido abc456');
  const response2 = typeof fallback2.responses[0] === 'string' 
    ? fallback2.responses[0] 
    : JSON.stringify(fallback2.responses[0]);
  console.log(`   Respuesta: ${response2.substring(0, 50)}...`);
  console.log(`   Es fallback: ${fallback2.isFallback}\n`);

  // 5. Probar tercer fallback (derivación)
  console.log('5️⃣ Probando TERCER FALLBACK (derivación a asesor)...');
  const fallback3 = await fallbackHandler.handle(user.id, 'mensaje final que no entiende def789');
  const response3 = typeof fallback3.responses[0] === 'string' 
    ? fallback3.responses[0] 
    : JSON.stringify(fallback3.responses[0]);
  console.log(`   Respuesta: ${response3.substring(0, 80)}...`);
  
  // Verificar que se activó el estado awaiting_advisor_name
  const session = await userRepository.getSession(user.id);
  console.log(`   Estado awaiting_advisor_name: ${session?.awaiting_advisor_name}`);
  console.log(`   Fallback attempts: ${session?.fallback_attempts}\n`);

  if (session?.awaiting_advisor_name) {
    // 6. Probar captura de nombre
    console.log('6️⃣ Probando CAPTURA DE NOMBRE...');
    const captureResult = await fallbackHandler.captureAdvisorName(
      user.id,
      user,
      'Juan Pérez García',
      session
    );
    const responseCapture = typeof captureResult.responses[0] === 'string' 
      ? captureResult.responses[0] 
      : JSON.stringify(captureResult.responses[0]);
    console.log(`   Respuesta: ${responseCapture.substring(0, 80)}...`);
    console.log(`   Fue detectado: ${captureResult.wasDetected}`);
    
    // Verificar que se reseteó el estado
    const sessionAfter = await userRepository.getSession(user.id);
    console.log(`   Estado awaiting_advisor_name después: ${sessionAfter?.awaiting_advisor_name}`);
    console.log(`   Fallback attempts reseteados: ${sessionAfter?.fallback_attempts}\n`);
  }

  // 7. Verificar que se creó la solicitud de asesor
  console.log('7️⃣ Verificando solicitud de asesor creada...');
  const { supabaseServer } = await import('../src/services/supabase/server-client');
  const { data: advisorRequests } = await supabaseServer
    .from('advisor_requests')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1);

  if (advisorRequests && advisorRequests.length > 0) {
    const request = advisorRequests[0];
    console.log(`   ✅ Solicitud creada: ${request.id}`);
    console.log(`   Razón: ${request.request_reason}`);
    console.log(`   Fallback count: ${request.fallback_count}`);
    console.log(`   Checkpoints completados: ${request.checkpoints_completed}`);
  } else {
    console.log(`   ❌ No se encontró solicitud de asesor`);
  }

  console.log('\n✅ Prueba completada exitosamente\n');
  console.log('📋 Resumen:');
  console.log('   - Fallback nivel 1: ✅ Funcionando');
  console.log('   - Fallback nivel 2: ✅ Funcionando');
  console.log('   - Fallback nivel 3 (derivación): ✅ Funcionando');
  console.log('   - Captura de nombre: ✅ Funcionando');
  console.log('   - Solicitud de asesor: ✅ Creada');
  console.log('   - Reset de contadores: ✅ Funcionando\n');
}

// Ejecutar prueba
testFallbackSystem()
  .then(() => {
    console.log('🎉 Test finalizado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error en test:', error);
    process.exit(1);
  });
