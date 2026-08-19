/**
 * Verifica que la configuracion del asesor tiene una sola fuente.
 *
 * `advisor_phone`, `business_hours` y `advisor_email` vivian en dos tablas a
 * la vez -- `agent_config` (migracion 007) y `bot_config` (migracion 009) --
 * y `bot_config` era la fuente de verdad solo por convencion, documentada
 * como trampa en AGENTS.md seccion 6. Ahora `agent_config` ya no declara esas
 * tres columnas: `bot_config` acotada por `scope_id` es la unica fuente, con
 * la misma herencia que el resto del contenido.
 *
 * Ejecutar contra el stack local con la secuencia completa aplicada:
 *   npx tsx scripts/test-advisor-config-precedence.ts
 */

import { randomUUID } from 'node:crypto';
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

async function main() {
  const { supabaseServer } = await import('@/services/supabase/server-client');
  const { appointmentRepository } = await import('@/data/repositories/appointment.repository');
  const { ROOT_SCOPE_ID, scopeRepository } = await import('@/data/repositories/scope.repository');

  let failures = 0;
  function check(label: string, actual: unknown, expected: unknown) {
    const ok = actual === expected;
    if (!ok) failures += 1;
    console.log(`${ok ? 'OK  ' : 'FALLA'} ${label}`);
    if (!ok) console.log(`      esperado: ${expected}\n      obtenido: ${actual}`);
  }

  async function setGlobalConfig(key: string, value: string) {
    const { error } = await supabaseServer
      .from('bot_config')
      .update({ config_value: value })
      .eq('config_key', key)
      .is('scope_id', null);
    if (error) throw error;
  }

  async function upsertScopedConfig(key: string, scopeId: string, value: string) {
    const { error } = await supabaseServer
      .from('bot_config')
      .upsert(
        { config_key: key, scope_id: scopeId, config_value: value, config_type: 'string', category: 'contact' },
        { onConflict: 'config_key,scope_id' }
      );
    if (error) throw error;
  }

  const { data: originalGlobal } = await supabaseServer
    .from('bot_config')
    .select('config_key, config_value')
    .in('config_key', ['advisor_phone', 'business_hours', 'advisor_email'])
    .is('scope_id', null);

  const suffix = randomUUID().slice(0, 8);
  const scopeIds: string[] = [];

  try {
    console.log('\n1. Ninguna columna de agent_config declara ya estos valores');
    const { error: columnError } = await supabaseServer
      .from('agent_config')
      .select('advisor_phone')
      .limit(1);
    check(
      'agent_config.advisor_phone ya no existe',
      Boolean(columnError && /column .*does not exist/i.test(columnError.message)),
      true
    );

    console.log('\n2. El valor de Ajustes (global, scope_id NULL) es el que se usa por omision');
    await setGlobalConfig('advisor_phone', '+525599998888');
    const desdeAjustes = await appointmentRepository.getDefaultAgent(ROOT_SCOPE_ID);
    check('usa el telefono de Ajustes', desdeAjustes.advisor_phone, '+525599998888');

    console.log('\n3. Editar Ajustes se refleja de inmediato');
    await setGlobalConfig('advisor_phone', '+525577776666');
    const trasEdicion = await appointmentRepository.getDefaultAgent(ROOT_SCOPE_ID);
    check('refleja la edicion sin reiniciar', trasEdicion.advisor_phone, '+525577776666');

    console.log('\n4. Un desarrollo con asesor propio deriva al suyo; el que no tiene, hereda');
    const { data: withOwn, error: withOwnError } = await supabaseServer
      .from('scopes').insert({
        parent_id: ROOT_SCOPE_ID,
        name: `Con asesor propio ${suffix}`,
        slug: `con-asesor-${suffix}`,
        is_active: true,
      }).select('id').single();
    if (withOwnError) throw withOwnError;
    scopeIds.push(withOwn.id);

    const { data: withoutOwn, error: withoutOwnError } = await supabaseServer
      .from('scopes').insert({
        parent_id: ROOT_SCOPE_ID,
        name: `Hereda ${suffix}`,
        slug: `hereda-${suffix}`,
        is_active: true,
      }).select('id').single();
    if (withoutOwnError) throw withoutOwnError;
    scopeIds.push(withoutOwn.id);
    scopeRepository.invalidateCache();

    await upsertScopedConfig('advisor_phone', withOwn.id, '+525511112222');

    const propio = await appointmentRepository.getDefaultAgent(withOwn.id);
    check('el desarrollo con fila propia deriva a su telefono', propio.advisor_phone, '+525511112222');

    const heredado = await appointmentRepository.getDefaultAgent(withoutOwn.id);
    check('el desarrollo sin fila propia hereda el de Ajustes', heredado.advisor_phone, '+525577776666');

    console.log('\n5. Sin telefono en el alcance ni en sus ancestros, la derivacion falla de forma visible');
    // No debe caer a default_agent_phone: es un placeholder sembrado por la
    // migracion 004 y usarlo reproduciria la falla silenciosa que este
    // cambio corrige.
    await setGlobalConfig('advisor_phone', '');
    let lanzo = false;
    try {
      await appointmentRepository.getDefaultAgent(withoutOwn.id);
    } catch {
      lanzo = true;
    }
    check('lanza error en lugar de usar un numero sembrado', lanzo, true);
    // El que tiene fila propia sigue respondiendo aunque Ajustes se vacie.
    const propioSigue = await appointmentRepository.getDefaultAgent(withOwn.id);
    check('la fila propia no depende de que Ajustes tenga valor', propioSigue.advisor_phone, '+525511112222');

    console.log('\n6. business_hours tambien sale de bot_config, con la misma herencia');
    await setGlobalConfig('advisor_phone', '+525599998888');
    await setGlobalConfig('business_hours', 'lunes a sabado 8:00 - 20:00');
    const horario = await appointmentRepository.getDefaultAgent(withoutOwn.id);
    check('usa el horario de Ajustes', horario.business_hours, 'lunes a sabado 8:00 - 20:00');

  } finally {
    for (const row of originalGlobal || []) {
      await setGlobalConfig(row.config_key, row.config_value ?? '');
    }
    for (const scopeId of scopeIds) {
      await supabaseServer.from('bot_config').delete().eq('scope_id', scopeId);
      await supabaseServer.from('scopes').delete().eq('id', scopeId);
    }
    scopeRepository.invalidateCache();
    console.log('\nEstado original restaurado.');
  }

  console.log(failures === 0 ? '\nTodo correcto.' : `\n${failures} verificacion(es) fallida(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('Error ejecutando la verificacion:', error);
  process.exit(1);
});
