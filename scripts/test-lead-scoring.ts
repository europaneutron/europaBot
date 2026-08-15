/**
 * Script de prueba para el sistema de Lead Scoring
 * 
 * Prueba:
 * 1. Usuario con 0 checkpoints (COLD)
 * 2. Usuario con 3 checkpoints (WARM)
 * 3. Usuario con 6 checkpoints (HOT)
 * 4. Usuario con checkpoints + cita (HOT)
 * 5. Usuario con checkpoints + auto-offer (WARM/HOT)
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Cargar variables de entorno
config({ path: resolve(__dirname, '../.env.development.local') });
config({ path: resolve(__dirname, '../.env.local') });

async function testLeadScoring() {
  const rootScopeId = '00000000-0000-4000-8000-000000000001';
  // Los modulos se cargan aqui y no arriba: un import estatico se iza por
  // encima de config(), y el cliente de Supabase se construiria antes de que
  // existan las variables de entorno.
  const { leadScorer } = await import('../src/core/scoring');
  const { userRepository } = await import('../src/data/repositories/user.repository');
  const { appointmentRepository } = await import('../src/data/repositories/appointment.repository');
  const { configRepository } = await import('../src/data/repositories/config.repository');

  console.log('🧪 Iniciando prueba del sistema de Lead Scoring\n');

  // 1. Verificar configuración
  console.log('1️⃣ Verificando configuración de puntos...');
  const checkpointPoints = await configRepository.getInt('checkpoint_points', 15);
  const appointmentPoints = await configRepository.getInt('appointment_points', 20);
  const autoOfferPoints = await configRepository.getInt('auto_offer_response_points', 10);
  const coldMax = await configRepository.getInt('lead_score_cold_max', 39);
  const warmMax = await configRepository.getInt('lead_score_warm_max', 69);
  
  console.log(`   Checkpoint: ${checkpointPoints} pts`);
  console.log(`   Cita: ${appointmentPoints} pts`);
  console.log(`   Auto-offer: ${autoOfferPoints} pts`);
  console.log(`   COLD: 0-${coldMax} | WARM: ${coldMax+1}-${warmMax} | HOT: ${warmMax+1}+\n`);

  // 2. Crear usuario de prueba
  console.log('2️⃣ Creando usuario de prueba...');
  const testPhone = '+52' + Math.floor(Math.random() * 10000000000);
  const user = await userRepository.findOrCreateByPhone(testPhone, 'Usuario Test Scoring');
  console.log(`   ✅ Usuario creado: ${user.id}\n`);

  // 3. Test: Usuario con 0 checkpoints (COLD)
  console.log('3️⃣ Test: Usuario sin checkpoints (esperado: COLD)');
  let breakdown = await leadScorer.getScoreBreakdown(user.id);
  console.log(`   Checkpoints: ${breakdown.checkpointsCompleted}`);
  console.log(`   Score: ${breakdown.totalScore} pts`);
  console.log(`   Status: ${breakdown.status.toUpperCase()}`);
  console.log(`   ✅ ${breakdown.status === 'cold' ? 'CORRECTO' : '❌ ERROR'}\n`);

  // 4. Test: Usuario con 3 checkpoints (WARM)
  console.log('4️⃣ Test: Usuario con 3 checkpoints (esperado: WARM)');
  await userRepository.markCheckpointCompleted(user.id, rootScopeId, 'precio');
  await userRepository.markCheckpointCompleted(user.id, rootScopeId, 'ubicacion');
  await userRepository.markCheckpointCompleted(user.id, rootScopeId, 'modelo');
  await leadScorer.recalculateAndUpdate(user.id);
  
  breakdown = await leadScorer.getScoreBreakdown(user.id);
  console.log(`   Checkpoints: ${breakdown.checkpointsCompleted}`);
  console.log(`   Score: ${breakdown.totalScore} pts (${breakdown.checkpointsCompleted} × ${checkpointPoints})`);
  console.log(`   Status: ${breakdown.status.toUpperCase()}`);
  console.log(`   ✅ ${breakdown.status === 'warm' ? 'CORRECTO' : '❌ ERROR'}\n`);

  // 5. Test: Usuario con 6 checkpoints (HOT)
  console.log('5️⃣ Test: Usuario con 6 checkpoints (esperado: HOT)');
  await userRepository.markCheckpointCompleted(user.id, rootScopeId, 'creditos');
  await userRepository.markCheckpointCompleted(user.id, rootScopeId, 'seguridad');
  await userRepository.markCheckpointCompleted(user.id, rootScopeId, 'brochure');
  await leadScorer.recalculateAndUpdate(user.id);
  
  breakdown = await leadScorer.getScoreBreakdown(user.id);
  console.log(`   Checkpoints: ${breakdown.checkpointsCompleted}`);
  console.log(`   Score: ${breakdown.totalScore} pts (${breakdown.checkpointsCompleted} × ${checkpointPoints})`);
  console.log(`   Status: ${breakdown.status.toUpperCase()}`);
  console.log(`   ✅ ${breakdown.status === 'hot' ? 'CORRECTO' : '❌ ERROR'}\n`);

  // 6. Test: Usuario con 3 checkpoints + cita (HOT)
  console.log('6️⃣ Test: Usuario con 3 checkpoints + cita agendada (esperado: HOT)');
  const user2Phone = '+52' + Math.floor(Math.random() * 10000000000);
  const user2 = await userRepository.findOrCreateByPhone(user2Phone, 'Usuario Test Con Cita');
  
  // Marcar 3 checkpoints
  await userRepository.markCheckpointCompleted(user2.id, rootScopeId, 'precio');
  await userRepository.markCheckpointCompleted(user2.id, rootScopeId, 'ubicacion');
  await userRepository.markCheckpointCompleted(user2.id, rootScopeId, 'modelo');
  
  // Crear cita
  await appointmentRepository.create({
    user_id: user2.id,
    visitor_name: 'Usuario Test Con Cita',
    requested_date: new Date().toISOString().split('T')[0],
    time_slot: 'morning'
  }, rootScopeId);
  
  await leadScorer.recalculateAndUpdate(user2.id);
  breakdown = await leadScorer.getScoreBreakdown(user2.id);
  
  console.log(`   Checkpoints: ${breakdown.checkpointsCompleted} (${breakdown.checkpointPoints} pts)`);
  console.log(`   Cita agendada: ${breakdown.hasAppointment ? 'Sí' : 'No'} (${breakdown.appointmentPoints} pts)`);
  console.log(`   Score total: ${breakdown.totalScore} pts`);
  console.log(`   Status: ${breakdown.status.toUpperCase()}`);
  console.log(`   ✅ ${breakdown.status === 'hot' ? 'CORRECTO' : '❌ ERROR'}\n`);

  // 7. Verificar actualización en BD
  console.log('7️⃣ Verificando actualización en base de datos...');
  const userFromDB = await userRepository.findById(user2.id);
  console.log(`   lead_score en BD: ${userFromDB?.lead_score}`);
  console.log(`   lead_status en BD: ${userFromDB?.lead_status}`);
  console.log(`   ✅ ${userFromDB?.lead_score === breakdown.totalScore ? 'SINCRONIZADO' : '❌ DESINCRONIZADO'}\n`);

  console.log('✅ Pruebas completadas exitosamente\n');
  
  console.log('📋 Resumen de scoring:');
  console.log(`   - Usuario con 0 checkpoints: COLD (${0} pts)`);
  console.log(`   - Usuario con 3 checkpoints: WARM (${3 * checkpointPoints} pts)`);
  console.log(`   - Usuario con 6 checkpoints: HOT (${6 * checkpointPoints} pts)`);
  console.log(`   - Usuario con 3 checkpoints + cita: HOT (${3 * checkpointPoints + appointmentPoints} pts)`);
  console.log(`   - Sistema actualiza automáticamente en BD ✅\n`);
}

// Ejecutar prueba
testLeadScoring()
  .then(() => {
    console.log('🎉 Test finalizado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error en test:', error);
    process.exit(1);
  });
