/**
 * El mensaje final del flujo de cita, tal como sale.
 *
 * Tres mensajes de cita (esta confirmacion, el de hora invalida, y uno del
 * flujo antiguo de fecha) traian "\n" como dos caracteres literales --barra
 * invertida y ene-- en vez de un salto de linea real: la migracion 011 los
 * escribio con comillas simples de SQL, que no interpretan escapes. En
 * WhatsApp el mensaje salia todo pegado, con "\n\n" visible como texto en
 * medio.
 *
 * De paso: la hora ya no lleva los segundos que Postgres siempre agrega a
 * una columna `time` ("09:00:00" -> "09:00"), cierra con "hrs", y el cierre
 * ya no es una pregunta ("¿Necesitas algo mas?") sino una afirmacion.
 *
 * Usa un usuario simulado (`is_simulated: true`) a proposito: con uno real,
 * `processName` notifica al asesor por WhatsApp de verdad, y este entorno
 * puede tener credenciales reales cargadas para probar un tunel.
 *
 *   npx tsx scripts/test-appointment-confirmation-format.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.development.local') });
config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!supabaseUrl || !/^http:\/\/(127\.0\.0\.1|localhost):/.test(supabaseUrl)) {
  console.error('NEXT_PUBLIC_SUPABASE_URL must point to the local stack');
  process.exit(1);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const { supabaseServer } = await import('../src/services/supabase/server-client');
  const { appointmentManager } = await import('../src/core/appointment/appointment-manager');
  const { userRepository } = await import('../src/data/repositories/user.repository');
  const { ROOT_SCOPE_ID } = await import('../src/data/repositories/scope.repository');

  // No se comprueba que la fila no exista un literal: se comprueba
  // directamente sobre bytes, para no depender de como el driver de
  // supabase-js decida representar el string en JS.
  const { data: rawRows } = await supabaseServer
    .from('bot_config')
    .select('config_key, config_value')
    .in('config_key', ['appointment_confirmation', 'appointment_invalid_time', 'appointment_request_time']);
  for (const row of rawRows || []) {
    assert(
      !row.config_value.includes('\\n'),
      `"${row.config_key}" no debe traer "\\n" literal: ${JSON.stringify(row.config_value)}`
    );
  }

  const suffix = Date.now().toString(36);
  const phone = `ap${suffix}`;

  try {
    const user = await userRepository.findOrCreateSimulatedByPhone(phone, 'Prueba de formato');

    await appointmentManager.startFlow(user.id, true, ROOT_SCOPE_ID);
    await appointmentManager.processFlowStep(user.id, 'el próximo sábado', ROOT_SCOPE_ID);
    await appointmentManager.processFlowStep(user.id, 'confirm_date', ROOT_SCOPE_ID);
    await appointmentManager.processFlowStep(user.id, 'morning', ROOT_SCOPE_ID);
    const result = await appointmentManager.processFlowStep(user.id, 'Lead de prueba', ROOT_SCOPE_ID);

    assert(result.step === 'completed', `el flujo debe completarse: ${JSON.stringify(result)}`);
    const message = result.message;

    assert(!message.includes('\\n'), `el mensaje final no debe traer "\\n" literal: ${JSON.stringify(message)}`);
    assert(message.includes('\n\n'), `y sí debe traer saltos de línea reales: ${JSON.stringify(message)}`);
    assert(
      /\(\d{2}:\d{2} - \d{2}:\d{2} hrs\)/.test(message),
      `la hora va sin segundos y cierra con "hrs": ${JSON.stringify(message)}`
    );
    assert(!message.includes('09:00:00'), `no deben quedar segundos: ${JSON.stringify(message)}`);
    assert(
      !message.includes('¿Necesitas algo más?'),
      `el cierre ya no es una pregunta: ${JSON.stringify(message)}`
    );

    console.log('Texto final:', JSON.stringify(message));
    console.log('Appointment confirmation format verification passed');
  } finally {
    const { data: user } = await supabaseServer.from('users').select('id').eq('phone_number', phone).maybeSingle();
    if (user) {
      for (const table of ['appointments', 'user_scope_progress', 'user_sessions', 'conversations', 'followup_messages']) {
        await supabaseServer.from(table).delete().eq('user_id', user.id);
      }
      await supabaseServer.from('users').delete().eq('id', user.id);
    }
  }
}

main().catch(error => {
  console.error('Appointment confirmation format verification failed:', error);
  process.exit(1);
});
