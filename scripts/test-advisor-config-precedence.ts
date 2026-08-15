/**
 * Verifica la precedencia de la configuracion del asesor.
 *
 * El riesgo que cubre: los valores sembrados por las migraciones 004 y 007 en
 * agent_config opacaban permanentemente a bot_config, que es lo que edita el
 * administrador desde Ajustes. El sintoma era silencioso: las notificaciones
 * salian a un numero de prueba y nada fallaba.
 *
 * Ejecutar contra el stack local con la secuencia completa aplicada:
 *   npx tsx scripts/test-advisor-config-precedence.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.development.local') });
config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

if (!/127\.0\.0\.1|localhost/.test(supabaseUrl)) {
  console.error('Abortado: este script solo corre contra el stack local.');
  console.error(`URL configurada: ${supabaseUrl}`);
  process.exit(1);
}

const ROOT_SCOPE_ID = '00000000-0000-4000-8000-000000000001';

async function main() {
  const { supabaseServer } = await import('@/services/supabase/server-client');
  const { appointmentRepository } = await import('@/data/repositories/appointment.repository');

  let failures = 0;

  function check(label: string, actual: unknown, expected: unknown) {
    const ok = actual === expected;
    if (!ok) failures += 1;
    console.log(`${ok ? 'OK  ' : 'FALLA'} ${label}`);
    if (!ok) console.log(`      esperado: ${expected}\n      obtenido: ${actual}`);
  }

  async function setBotConfig(key: string, value: string) {
    const { error } = await supabaseServer
      .from('bot_config')
      .update({ config_value: value })
      .eq('config_key', key);
    if (error) throw error;
  }

  async function setRootAgent(fields: Record<string, string | null>) {
    const { error } = await supabaseServer
      .from('agent_config')
      .update(fields)
      .eq('scope_id', ROOT_SCOPE_ID);
    if (error) throw error;
  }

  const { data: originalConfig } = await supabaseServer
    .from('bot_config')
    .select('config_key, config_value')
    .in('config_key', ['advisor_phone', 'business_hours', 'advisor_email']);

  const { data: originalAgent } = await supabaseServer
    .from('agent_config')
    .select('advisor_phone, business_hours, advisor_email')
    .eq('scope_id', ROOT_SCOPE_ID)
    .single();

  try {
    console.log('\n1. Tras la migracion, la fila raiz no opaca a bot_config');
    check('advisor_phone raiz esta vacio', originalAgent?.advisor_phone ?? null, null);
    check('business_hours raiz esta vacio', originalAgent?.business_hours ?? null, null);

    console.log('\n2. El valor de Ajustes es el que se usa');
    await setBotConfig('advisor_phone', '+525599998888');
    const desdeAjustes = await appointmentRepository.getDefaultAgent(ROOT_SCOPE_ID);
    check('usa el telefono de Ajustes', desdeAjustes.advisor_phone, '+525599998888');

    console.log('\n3. Editar Ajustes se refleja de inmediato');
    await setBotConfig('advisor_phone', '+525577776666');
    const trasEdicion = await appointmentRepository.getDefaultAgent(ROOT_SCOPE_ID);
    check('refleja la edicion sin reiniciar', trasEdicion.advisor_phone, '+525577776666');

    console.log('\n4. Un alcance con valor propio sobrescribe a Ajustes');
    await setRootAgent({ advisor_phone: '+525511112222' });
    const conSobrescritura = await appointmentRepository.getDefaultAgent(ROOT_SCOPE_ID);
    check('la sobrescritura gana', conSobrescritura.advisor_phone, '+525511112222');
    await setRootAgent({ advisor_phone: null });

    console.log('\n5. Sin telefono en ninguna parte, falla con error claro');
    // No debe caer a default_agent_phone: es un placeholder sembrado por la
    // migracion 004 y usarlo reproduciria la falla silenciosa que se corrigio.
    await setBotConfig('advisor_phone', '');
    let lanzo = false;
    try {
      await appointmentRepository.getDefaultAgent(ROOT_SCOPE_ID);
    } catch {
      lanzo = true;
    }
    check('lanza error en lugar de usar un numero sembrado', lanzo, true);

    console.log('\n6. business_hours tambien sale de Ajustes');
    // El escenario anterior dejo el telefono vacio a proposito; sin el,
    // getDefaultAgent lanza antes de poder comprobar el horario.
    await setBotConfig('advisor_phone', '+525599998888');
    await setBotConfig('business_hours', 'lunes a sabado 8:00 - 20:00');
    const horario = await appointmentRepository.getDefaultAgent(ROOT_SCOPE_ID);
    check('usa el horario de Ajustes', horario.business_hours, 'lunes a sabado 8:00 - 20:00');

  } finally {
    for (const row of originalConfig || []) {
      await setBotConfig(row.config_key, row.config_value ?? '');
    }
    await setRootAgent({
      advisor_phone: originalAgent?.advisor_phone ?? null,
      business_hours: originalAgent?.business_hours ?? null,
      advisor_email: originalAgent?.advisor_email ?? null,
    });
    console.log('\nEstado original restaurado.');
  }

  console.log(failures === 0 ? '\nTodo correcto.' : `\n${failures} verificacion(es) fallida(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('Error ejecutando la verificacion:', error);
  process.exit(1);
});
