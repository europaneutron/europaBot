/**
 * Simulacion punta a punta de la conversacion objetivo, contra el codigo de hoy.
 *
 * Siembra el catalogo de FYMSA --dos desarrollos, cinco modelos y terrenos-- con
 * el contenido que un compilador ideal habria producido: intenciones propias por
 * alcance y respuestas en el nivel donde vive el dato. Despues manda los turnos
 * de la conversacion aprobada y imprime lo que el bot contesta de verdad.
 *
 * El objetivo es separar dos preguntas que se confunden: si el runtime puede
 * sostener la conversacion, y si el compilador puede producir el contenido que
 * la sostiene. Sembrando el contenido a mano, lo que falle es del runtime.
 *
 * No deja nada: desactiva los desarrollos existentes mientras corre y los
 * restaura al terminar.
 *
 *   npx tsx scripts/simulate-fymsa.ts
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

config({ path: resolve(process.cwd(), '.env.development.local') });
config({ path: resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) {
  console.error('Solo contra Supabase local');
  process.exit(1);
}

const suffix = randomUUID().slice(0, 6);

interface SeedResponse {
  intentName: string;
  text: string;
}

async function main() {
  const { supabaseServer } = await import('../src/services/supabase/server-client');
  const { messageProcessor } = await import('../src/core/conversation/message-processor');
  const { scopeRepository, ROOT_SCOPE_ID } = await import('../src/data/repositories/scope.repository');
  const { offerButtons } = await import('../src/core/conversation/pending-offer-messages');

  const createdScopes: string[] = [];
  const createdIntents: string[] = [];
  const deactivated: string[] = [];
  const deactivatedRootIntents: string[] = [];
  const phone = `sim${Date.now().toString(36)}`;

  async function scope(name: string, parentId: string, type: string, aliases: string[]) {
    const { data, error } = await supabaseServer.from('scopes').insert({
      name,
      slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${suffix}`,
      parent_id: parentId,
      scope_type: type,
    }).select('*').single();
    if (error) throw error;
    createdScopes.push(data.id);
    for (const alias of aliases) {
      await supabaseServer.from('scope_aliases').insert({
        scope_id: data.id,
        alias,
        normalized_alias: alias.toLowerCase(),
      });
    }
    return data.id as string;
  }

  async function content(scopeId: string, rows: SeedResponse[]) {
    for (const row of rows) {
      const { data: intent, error } = await supabaseServer.from('intent_configurations').insert({
        intent_name: row.intentName,
        display_name: row.intentName,
        scope_id: scopeId,
        keywords: KEYWORDS[row.intentName] || [],
        synonyms: [],
        typos: [],
        phrases: [],
        priority: 10,
        is_active: true,
      }).select('*').single();
      if (error) throw error;
      createdIntents.push(intent.id);
      const { error: responseError } = await supabaseServer.from('bot_responses').insert({
        intent_id: intent.id,
        intent_name: row.intentName,
        response_key: 'main',
        response_type: 'simple',
        message_text: row.text,
        is_active: true,
        order_priority: 1,
      });
      if (responseError) throw responseError;
    }
  }

  const KEYWORDS: Record<string, string[]> = {
    precio: ['precio', 'precios', 'cuesta', 'cuestan', 'costo', 'vale', 'valen'],
    ubicacion: ['ubicacion', 'donde', 'direccion', 'ubicado', 'queda'],
    seguridad: ['seguridad', 'amenidades', 'vigilancia', 'alberca'],
    modelo: ['modelo', 'modelos', 'casas', 'tipos'],
    cita: ['agendar', 'visita', 'cita', 'visitar'],
  };

  try {
    // Los desarrollos que ya existen enturbian la lista que el bot ofrece.
    const { data: existing } = await supabaseServer
      .from('scopes').select('id').eq('parent_id', ROOT_SCOPE_ID).eq('is_active', true);
    for (const row of existing || []) {
      await supabaseServer.from('scopes').update({ is_active: false }).eq('id', row.id);
      deactivated.push(row.id);
    }

    // Contenido suelto en la raíz de corridas anteriores del compilador
    // también enturbia la conversación: el nuevo "afirma lo cierto antes de
    // preguntar" (spec `enumerated-disambiguation`) sí lo resuelve, donde el
    // flujo viejo nunca lo tocaba. Solo para las intenciones que este guion
    // vuelve a sembrar por alcance: `modelo` y `cita` se dejan tal cual,
    // porque esta simulación depende de que sigan resolviendo por herencia
    // global en vez de resembrarlas.
    const RESEEDED_INTENT_NAMES = ['precio', 'ubicacion', 'seguridad'];
    const { data: staleRootIntents } = await supabaseServer
      .from('intent_configurations')
      .select('id')
      .eq('scope_id', ROOT_SCOPE_ID)
      .in('intent_name', RESEEDED_INTENT_NAMES)
      .eq('is_active', true);
    for (const row of staleRootIntents || []) {
      await supabaseServer.from('intent_configurations').update({ is_active: false }).eq('id', row.id);
      deactivatedRootIntents.push(row.id);
    }

    const europa = await scope('Europa', ROOT_SCOPE_ID, 'development', ['Europa']);
    const altabrisa = await scope('Altabrisa', ROOT_SCOPE_ID, 'development', ['Altabrisa']);
    const aura = await scope('Modelo Aura', europa, 'model', ['Aura', 'Modelo Aura']);
    const vento = await scope('Modelo Vento', europa, 'model', ['Vento', 'Modelo Vento']);
    const solara = await scope('Modelo Solara', europa, 'model', ['Solara', 'Modelo Solara']);
    const terrenos = await scope('Terrenos', europa, 'model', ['Terrenos', 'lotes']);
    const cala = await scope('Modelo Cala', altabrisa, 'model', ['Cala', 'Modelo Cala']);
    const mare = await scope('Modelo Mare', altabrisa, 'model', ['Mare', 'Modelo Mare']);
    scopeRepository.invalidateCache?.(supabaseServer);

    await content(europa, [
      { intentName: 'precio', text: 'En Europa las casas van desde $1,850,000 y los terrenos desde $780,000.' },
      { intentName: 'ubicacion', text: 'Europa esta en Avenida Ruiz Cortines 1820, Colonia Tamulte.' },
      { intentName: 'seguridad', text: 'Europa tiene caseta 24/7, alberca semiolimpica y casa club.' },
    ]);
    await content(altabrisa, [
      { intentName: 'precio', text: 'En Altabrisa las casas van desde $1,420,000.' },
      { intentName: 'ubicacion', text: 'Altabrisa esta en Prolongacion Paseo Tabasco 1503.' },
    ]);
    await content(aura, [{ intentName: 'precio', text: 'Modelo Aura: desde $1,850,000, 3 recamaras y 2 banos.' }]);
    await content(vento, [{ intentName: 'precio', text: 'Modelo Vento: desde $2,340,000, 3 recamaras y 3 banos.' }]);
    await content(solara, [{ intentName: 'precio', text: 'Modelo Solara: desde $2,980,000, 4 recamaras y 4 banos.' }]);
    await content(terrenos, [{ intentName: 'precio', text: 'Terrenos desde $780,000, de 160 m2.' }]);
    await content(cala, [{ intentName: 'precio', text: 'Modelo Cala: desde $1,420,000, 2 recamaras.' }]);
    await content(mare, [{ intentName: 'precio', text: 'Modelo Mare: desde $1,780,000, 3 recamaras.' }]);

    const turns = [
      'Hola',
      '¿Cuánto cuestan?',
      'Europa',
      'Solara',
      '¿Dónde está?',
      '¿Qué amenidades tiene?',
      '¿Y en Altabrisa cuánto cuesta?',
      'precio de Cala',
      '¿cuál es la más barata de Europa con 3 recámaras?',
      'Quiero agendar',
    ];

    console.log('\n================ CONVERSACION SIMULADA ================\n');
    for (let index = 0; index < turns.length; index += 1) {
      const text = turns[index];
      const result = await messageProcessor.processMessage(
        phone,
        text,
        `wamid.sim-${suffix}-${index}`,
        'Simulacion'
      );
      const replies = Array.isArray(result?.responses)
        ? result.responses
        : [JSON.stringify(result)];
      console.log(`Lead  ${text}`);
      for (const reply of replies) {
        const body = typeof reply === 'string' ? reply : JSON.stringify(reply);
        console.log(`Bot   ${body.replace(/\n/g, '\n      ')}`);
      }
      const userId = (await supabaseServer.from('users').select('id').eq('phone_number', phone).single()).data!.id;

      // Las opciones no viajan en el texto: quien las enseña es el transporte.
      // El recorrido de aceptacion tiene que enseñar lo que ve el lead, o la
      // pregunta se lee como si no ofreciera nada.
      const buttons = await offerButtons(userId, '');
      if (buttons.length > 0) {
        console.log(`      ${buttons.map(button => `[ ${button.title} ]`).join('  ')}`);
      }

      const { data: session } = await supabaseServer
        .from('user_sessions')
        .select('current_scope_id, pending_scope_message')
        .eq('user_id', userId)
        .maybeSingle();
      const { data: focusScope } = session?.current_scope_id
        ? await supabaseServer.from('scopes').select('name').eq('id', session.current_scope_id).maybeSingle()
        : { data: null };
      console.log(`      [foco: ${focusScope?.name || 'ninguno'} | pendiente: ${session?.pending_scope_message || 'ninguna'} | fallback: ${result?.isFallback ? 'si' : 'no'}]`);
      console.log('');
    }
  } finally {
    const { data: user } = await supabaseServer
      .from('users').select('id').eq('phone_number', phone).maybeSingle();
    if (user) {
      await supabaseServer.from('conversations').delete().eq('user_id', user.id);
      await supabaseServer.from('user_scope_progress').delete().eq('user_id', user.id);
      await supabaseServer.from('appointments').delete().eq('user_id', user.id);
      await supabaseServer.from('followup_messages').delete().eq('user_id', user.id);
      await supabaseServer.from('user_sessions').delete().eq('user_id', user.id);
      await supabaseServer.from('users').delete().eq('id', user.id);
    }
    for (const intentId of createdIntents) {
      await supabaseServer.from('bot_responses').delete().eq('intent_id', intentId);
      await supabaseServer.from('intent_configurations').delete().eq('id', intentId);
    }
    for (const scopeId of createdScopes.reverse()) {
      await supabaseServer.from('scope_aliases').delete().eq('scope_id', scopeId);
      const { error } = await supabaseServer.from('scopes').delete().eq('id', scopeId);
      if (error) console.error(`No se pudo limpiar el alcance ${scopeId}: ${error.message}`);
    }
    for (const scopeId of deactivated) {
      await supabaseServer.from('scopes').update({ is_active: true }).eq('id', scopeId);
    }
    for (const intentId of deactivatedRootIntents) {
      await supabaseServer.from('intent_configurations').update({ is_active: true }).eq('id', intentId);
    }
    console.log('Base restaurada.');
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
