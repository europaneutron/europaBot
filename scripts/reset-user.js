/**
 * Script para resetear o borrar completamente un usuario
 * 
 * USO:
 *   node scripts/reset-user.js <phone> [--delete]
 * 
 * EJEMPLOS:
 *   node scripts/reset-user.js 5212345678901          # Reset suave (mantiene usuario)
 *   node scripts/reset-user.js 5212345678901 --delete # Borra completamente
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const phone = process.argv[2];
  const shouldDelete = process.argv[3] === '--delete';

  if (!phone) {
    console.log(`
USO:
  node scripts/reset-user.js <phone> [--delete]

OPCIONES:
  --delete    Borra el usuario completamente (CASCADE)
              Sin esta opción, solo resetea datos pero mantiene usuario

EJEMPLOS:
  node scripts/reset-user.js 5212345678901          # Reset suave
  node scripts/reset-user.js 5212345678901 --delete # Borrar total
    `);
    process.exit(1);
  }

  console.log(`\n🔍 Buscando usuario: ${phone}`);

  // Buscar usuario
  const { data: user, error: findError } = await supabase
    .from('users')
    .select('*')
    .eq('phone_number', phone)
    .single();

  if (findError || !user) {
    console.log(`❌ Usuario no encontrado: ${phone}`);
    process.exit(1);
  }

  console.log(`✓ Usuario encontrado:`);
  console.log(`  ID: ${user.id}`);
  console.log(`  Nombre: ${user.name || 'Sin nombre'}`);
  console.log(`  Lead Score: ${user.lead_score}`);
  console.log(`  Lead Status: ${user.lead_status}`);

  // Contar datos relacionados
  const [conversations, appointments, advisorRequests, progress] = await Promise.all([
    supabase.from('conversations').select('id', { count: 'exact' }).eq('user_id', user.id),
    supabase.from('appointments').select('id', { count: 'exact' }).eq('user_id', user.id),
    supabase.from('advisor_requests').select('id', { count: 'exact' }).eq('user_id', user.id),
    supabase.from('user_progress').select('*').eq('user_id', user.id).single()
  ]);

  console.log(`\n📊 Datos asociados:`);
  console.log(`  Mensajes: ${conversations.count || 0}`);
  console.log(`  Citas: ${appointments.count || 0}`);
  console.log(`  Solicitudes asesor: ${advisorRequests.count || 0}`);
  
  if (progress.data) {
    const checkpoints = ['precio', 'ubicacion', 'modelo', 'creditos', 'seguridad', 'brochure']
      .filter(c => progress.data[`${c}_completed`]);
    console.log(`  Checkpoints: ${checkpoints.length}/6 (${checkpoints.join(', ') || 'ninguno'})`);
    console.log(`  Flow State: ${progress.data.appointment_flow_state || 'ninguno'}`);
  }

  if (shouldDelete) {
    // BORRADO TOTAL
    console.log(`\n🗑️  BORRANDO COMPLETAMENTE (CASCADE)...`);
    
    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', user.id);

    if (deleteError) {
      console.log(`❌ Error al borrar: ${deleteError.message}`);
      process.exit(1);
    }

    console.log(`✅ Usuario ${phone} ELIMINADO completamente`);
    console.log(`   Todos los datos relacionados fueron eliminados por CASCADE`);

  } else {
    // RESET SUAVE
    console.log(`\n🔄 RESETEANDO (mantiene usuario)...`);

    // 1. Resetear user_progress
    const { error: progressError } = await supabase
      .from('user_progress')
      .update({
        precio_completed: false,
        precio_completed_at: null,
        ubicacion_completed: false,
        ubicacion_completed_at: null,
        modelo_completed: false,
        modelo_completed_at: null,
        creditos_completed: false,
        creditos_completed_at: null,
        seguridad_completed: false,
        seguridad_completed_at: null,
        brochure_completed: false,
        brochure_completed_at: null,
        appointment_offered: false,
        appointment_offered_at: null,
        appointment_flow_state: null,
        appointment_flow_data: null,
        last_intent: null,
        last_intent_at: null
      })
      .eq('user_id', user.id);

    if (progressError) console.log(`  ⚠️ Error en progress: ${progressError.message}`);
    else console.log(`  ✓ user_progress reseteado`);

    // 2. Borrar conversaciones
    const { error: convError } = await supabase
      .from('conversations')
      .delete()
      .eq('user_id', user.id);

    if (convError) console.log(`  ⚠️ Error en conversations: ${convError.message}`);
    else console.log(`  ✓ conversations eliminadas`);

    // 3. Borrar intent logs
    const { error: logsError } = await supabase
      .from('intents_log')
      .delete()
      .eq('user_id', user.id);

    if (logsError) console.log(`  ⚠️ Error en intents_log: ${logsError.message}`);
    else console.log(`  ✓ intents_log eliminados`);

    // 4. Borrar citas
    const { error: aptError } = await supabase
      .from('appointments')
      .delete()
      .eq('user_id', user.id);

    if (aptError) console.log(`  ⚠️ Error en appointments: ${aptError.message}`);
    else console.log(`  ✓ appointments eliminadas`);

    // 5. Borrar solicitudes de asesor
    const { error: advError } = await supabase
      .from('advisor_requests')
      .delete()
      .eq('user_id', user.id);

    if (advError) console.log(`  ⚠️ Error en advisor_requests: ${advError.message}`);
    else console.log(`  ✓ advisor_requests eliminadas`);

    // 6. Resetear session
    const { error: sessionError } = await supabase
      .from('user_sessions')
      .update({
        fallback_attempts: 0,
        awaiting_advisor_name: false,
        current_flow: null,
        last_intent_detected: null,
        conversation_context: []
      })
      .eq('user_id', user.id);

    if (sessionError) console.log(`  ⚠️ Error en session: ${sessionError.message}`);
    else console.log(`  ✓ user_sessions reseteada`);

    // 7. Resetear usuario
    const { error: userError } = await supabase
      .from('users')
      .update({
        lead_score: 0,
        lead_status: 'cold',
        current_state: 'active'
      })
      .eq('id', user.id);

    if (userError) console.log(`  ⚠️ Error en user: ${userError.message}`);
    else console.log(`  ✓ users reseteado (score=0, status=cold)`);

    console.log(`\n✅ Usuario ${phone} RESETEADO completamente`);
    console.log(`   El usuario sigue existiendo pero como si fuera nuevo`);
  }

  console.log('');
}

main().catch(console.error);
