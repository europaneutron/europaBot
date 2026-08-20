/**
 * Deja la base local en la forma del caso FYMSA, para poder recorrer
 * `openspec/conversacion-objetivo.md` en el navegador.
 *
 * Siembra dos desarrollos con sus modelos, sus alias y contenido propio por
 * alcance. **Ese contenido lo escribe este script, no el compilador**: sirve
 * para ejercitar el runtime, no para demostrar que el compilador sepa
 * producirlo, que es justamente lo que hoy no hace.
 *
 * Lo que deja roto a proposito, porque es el criterio de aceptacion de las
 * specs pendientes: `precio` en la raiz con varias respuestas activas, las
 * plantillas sembradas con marcadores sin llenar, y un modelo mencionado a
 * secas cayendo al fallback.
 *
 *   npx tsx scripts/seed-fymsa.ts
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.development.local') });
config({ path: resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) {
  console.error('Este script escribe datos y solo corre contra Supabase local');
  process.exit(1);
}

interface ScopeSeed {
  name: string;
  aliases: string[];
  content: Array<{ intent: string; text: string }>;
  children?: ScopeSeed[];
}

const CATALOG: ScopeSeed[] = [
  {
    name: 'Europa',
    aliases: ['Europa', 'Residencial Europa'],
    content: [
      { intent: 'precio', text: 'En Europa las casas van desde $1,850,000 y los terrenos desde $780,000.' },
      { intent: 'ubicacion', text: 'Europa está en Avenida Ruiz Cortines 1820, Colonia Tamulté, Villahermosa. A 8 minutos de Plaza Altabrisa.' },
      { intent: 'seguridad', text: 'Europa tiene caseta de vigilancia 24/7, alberca semiolímpica, casa club y áreas verdes en el 22% del terreno.' },
      { intent: 'modelo', text: 'En Europa manejamos tres modelos de casa —Aura, Vento y Solara— y también terrenos.' },
    ],
    children: [
      {
        name: 'Modelo Aura',
        aliases: ['Aura', 'Modelo Aura'],
        content: [{ intent: 'precio', text: 'Modelo Aura: desde $1,850,000. Terreno de 160 m2 y construcción de 118 m2, 3 recámaras y 2 baños.' }],
      },
      {
        name: 'Modelo Vento',
        aliases: ['Vento', 'Modelo Vento'],
        content: [{ intent: 'precio', text: 'Modelo Vento: desde $2,340,000. Terreno de 200 m2 y construcción de 152 m2, 3 recámaras y 3 baños.' }],
      },
      {
        name: 'Modelo Solara',
        aliases: ['Solara', 'Modelo Solara'],
        content: [{ intent: 'precio', text: 'Modelo Solara: desde $2,980,000. Terreno de 250 m2 y construcción de 198 m2, 4 recámaras y 4 baños.' }],
      },
      {
        name: 'Terrenos',
        aliases: ['Terrenos', 'terreno', 'lotes'],
        content: [{ intent: 'precio', text: 'Los terrenos en Europa van desde $780,000, con superficies de 160 a 300 m2.' }],
      },
    ],
  },
  {
    name: 'Altabrisa',
    aliases: ['Altabrisa', 'Residencial Altabrisa'],
    content: [
      { intent: 'precio', text: 'En Altabrisa las casas van desde $1,420,000.' },
      { intent: 'ubicacion', text: 'Altabrisa está en Prolongación Paseo Tabasco 1503, Fraccionamiento Lomas de Ocuiltzapotlán, Villahermosa.' },
      { intent: 'seguridad', text: 'Altabrisa tiene acceso controlado, parque lineal y cancha de usos múltiples.' },
      { intent: 'modelo', text: 'En Altabrisa manejamos dos modelos: Cala y Mare.' },
    ],
    children: [
      {
        name: 'Modelo Cala',
        aliases: ['Cala', 'Modelo Cala'],
        content: [{ intent: 'precio', text: 'Modelo Cala: desde $1,420,000. Terreno de 140 m2 y construcción de 96 m2, 2 recámaras y 1.5 baños.' }],
      },
      {
        name: 'Modelo Mare',
        aliases: ['Mare', 'Modelo Mare'],
        content: [{ intent: 'precio', text: 'Modelo Mare: desde $1,780,000. Terreno de 160 m2 y construcción de 124 m2, 3 recámaras y 2 baños.' }],
      },
    ],
  },
];

async function main() {
  const { supabaseServer } = await import('../src/services/supabase/server-client');
  const { ROOT_SCOPE_ID, scopeRepository } = await import('../src/data/repositories/scope.repository');
  const { normalizeScopeAlias } = await import('../src/core/messaging/client-brand');
  const { clientBrandRepository } = await import('../src/data/repositories/client-brand.repository');

  // Las intenciones de la raiz son la plantilla: un alcance que define la suya
  // necesita los mismos patrones, o la deteccion deja de reconocerla ahi.
  const { data: rootIntents, error: rootError } = await supabaseServer
    .from('intent_configurations')
    .select('*')
    .eq('scope_id', ROOT_SCOPE_ID);
  if (rootError) throw rootError;
  const templateByName = new Map((rootIntents || []).map(intent => [intent.intent_name, intent]));

  async function seedScope(seed: ScopeSeed, parentId: string): Promise<void> {
    const slugBase = normalizeScopeAlias(seed.name).replace(/\s+/g, '-');
    const { data: scope, error } = await supabaseServer
      .from('scopes')
      .insert({
        name: seed.name,
        slug: `${slugBase}-fymsa`,
        parent_id: parentId,
        scope_type: parentId === ROOT_SCOPE_ID ? 'development' : 'model',
      })
      .select('*')
      .single();
    if (error) throw error;

    for (const alias of seed.aliases) {
      const { error: aliasError } = await supabaseServer.from('scope_aliases').insert({
        scope_id: scope.id,
        alias,
        normalized_alias: normalizeScopeAlias(alias),
      });
      if (aliasError) throw aliasError;
    }

    for (const row of seed.content) {
      const template = templateByName.get(row.intent);
      if (!template) {
        console.warn(`  sin intencion de referencia para "${row.intent}", se omite`);
        continue;
      }
      const { data: intent, error: intentError } = await supabaseServer
        .from('intent_configurations')
        .insert({
          intent_name: template.intent_name,
          display_name: template.display_name,
          scope_id: scope.id,
          keywords: template.keywords,
          synonyms: template.synonyms,
          typos: template.typos,
          phrases: template.phrases,
          min_confidence: template.min_confidence,
          priority: template.priority,
          is_checkpoint: template.is_checkpoint,
          is_strong_signal: template.is_strong_signal,
          is_active: true,
        })
        .select('*')
        .single();
      if (intentError) throw intentError;

      const { error: responseError } = await supabaseServer.from('bot_responses').insert({
        intent_id: intent.id,
        intent_name: template.intent_name,
        response_key: 'main',
        response_type: 'simple',
        message_text: row.text,
        is_active: true,
        order_priority: 1,
      });
      if (responseError) throw responseError;
    }

    console.log(`  ${seed.name}: ${seed.aliases.length} alias, ${seed.content.length} respuestas`);
    for (const child of seed.children || []) {
      await seedScope(child, scope.id);
    }
  }

  // 1. Retirar el resto de la factura de Microsoft, que no es material inmobiliario.
  const { data: lorcmex } = await supabaseServer
    .from('scopes').select('id').eq('name', 'Lorcmex').maybeSingle();
  if (lorcmex) {
    const { data: descendants } = await supabaseServer
      .from('scopes').select('id').eq('parent_id', lorcmex.id);
    const ids = [...(descendants || []).map(row => row.id), lorcmex.id];
    await supabaseServer.from('scope_aliases').delete().in('scope_id', ids);
    for (const id of ids) {
      const { error } = await supabaseServer.from('scopes').delete().eq('id', id);
      if (error) console.error(`No se pudo retirar el alcance ${id}: ${error.message}`);
    }
    console.log('Retirado: Lorcmex y su producto');
  }

  // 2. Monteverde se desactiva, no se borra: su contenido compilado es la
  //    evidencia de los defectos que las specs pendientes corrigen.
  const { data: monteverde } = await supabaseServer
    .from('scopes').select('id').eq('name', 'Residencial Monteverde').maybeSingle();
  if (monteverde) {
    await supabaseServer.from('scopes').update({ is_active: false }).eq('id', monteverde.id);
    console.log('Desactivado: Residencial Monteverde (se conserva como evidencia)');
  }

  // 3. La raiz es el negocio.
  await supabaseServer.from('scopes')
    .update({ name: 'Inmobiliaria FYMSA' })
    .eq('id', ROOT_SCOPE_ID);
  await clientBrandRepository.update({
    businessName: 'Inmobiliaria FYMSA',
    useComposedGreeting: true,
  });
  console.log('Raiz: Inmobiliaria FYMSA');

  // 4. El catalogo.
  for (const seed of CATALOG) {
    const { data: existing } = await supabaseServer
      .from('scopes').select('id').eq('name', seed.name).eq('parent_id', ROOT_SCOPE_ID).maybeSingle();
    if (existing) {
      console.log(`  ${seed.name} ya existe, se omite`);
      continue;
    }
    await seedScope(seed, ROOT_SCOPE_ID);
  }

  scopeRepository.invalidateCache?.(supabaseServer);
  console.log('\nListo. Recorre la conversacion en http://localhost:54900/simulator');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
