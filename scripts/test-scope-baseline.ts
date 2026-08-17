import { config } from 'dotenv';
import { resolve } from 'path';
import baseline from '../openspec/changes/scope-tree/baseline.json';

config({ path: resolve(process.cwd(), '.env.development.local') });
config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!supabaseUrl || (!supabaseUrl.includes('127.0.0.1') && !supabaseUrl.includes('localhost'))) {
  console.error('NEXT_PUBLIC_SUPABASE_URL must point to the local stack');
  process.exit(1);
}

/**
 * La deteccion y el conteo de respuestas se comprueban contra un alcance que
 * esta prueba siembra y borra.
 *
 * Antes se afirmaban contra las filas de la raiz, con los conteos congelados en
 * `baseline.json`. Eso convertia cualquier cambio legitimo del contenido —una
 * respuesta compilada, un seguimiento nuevo— en un fallo de esta prueba, y la
 * unica salida era volver a congelar la foto, que es tanto como no comprobar
 * nada. Lo que hay que proteger es que resolver siga eligiendo la intencion
 * correcta y devolviendo sus respuestas, y eso no depende de cuantas tenga hoy
 * la raiz.
 */
async function verifyDetectionAgainstOwnData(output: unknown[]): Promise<void> {
  const { supabaseServer } = await import('../src/services/supabase/server-client');
  const { intentDetectionService } = await import('../src/core/intent-engine/intent-detection.service');
  const { conversationRepository } = await import('../src/data/repositories/conversation.repository');
  const { scopeRepository } = await import('../src/data/repositories/scope.repository');

  const suffix = Date.now().toString(36);
  const cases = [
    { message: 'precio', intent: 'precio', keywords: ['precio', 'cuesta'], responseCount: 2 },
    { message: 'ubicacion', intent: 'ubicacion', keywords: ['ubicacion', 'donde'], responseCount: 2 },
    { message: 'hola', intent: 'saludo', keywords: ['hola', 'buenas'], responseCount: 1 },
  ];

  const { data: scope, error: scopeError } = await supabaseServer
    .from('scopes')
    .insert({
      parent_id: baseline.rootScopeId,
      name: `Baseline ${suffix}`,
      slug: `baseline-${suffix}`,
      scope_type: 'proyecto',
    })
    .select('id')
    .single();
  if (scopeError) throw scopeError;

  try {
    for (const testCase of cases) {
      const { data: intent, error: intentError } = await supabaseServer
        .from('intent_configurations')
        .insert({
          scope_id: scope.id,
          intent_name: testCase.intent,
          display_name: `${testCase.intent} ${suffix}`,
          keywords: testCase.keywords,
          is_active: true,
        })
        .select('id')
        .single();
      if (intentError) throw intentError;

      const { error: responseError } = await supabaseServer
        .from('bot_responses')
        .insert(Array.from({ length: testCase.responseCount }, (_, index) => ({
          intent_id: intent.id,
          intent_name: testCase.intent,
          response_key: index === 0 ? 'main' : `followup_${index}`,
          message_text: `${testCase.intent}-${index}-${suffix}`,
          response_type: 'simple',
          is_active: true,
          order_priority: index + 1,
        })));
      if (responseError) throw responseError;
    }

    intentDetectionService.invalidateAll();
    for (const testCase of cases) {
      const detection = await intentDetectionService.detect(
        testCase.message,
        supabaseServer,
        scope.id
      );
      const responses = detection.intent
        ? await conversationRepository.getBotResponses(
            (detection.intent as any).response_intent_ids || detection.intent.intent_id
          )
        : [];

      output.push({ message: testCase.message, intent: detection.intent?.intent_name || null, responses });

      if (detection.intent?.intent_name !== testCase.intent) {
        throw new Error(`Expected ${testCase.intent} for "${testCase.message}"`);
      }
      if (responses.length !== testCase.responseCount) {
        throw new Error(
          `Expected ${testCase.responseCount} responses for ${testCase.intent}, got ${responses.length}`
        );
      }
    }
  } finally {
    const { data: intents } = await supabaseServer
      .from('intent_configurations')
      .select('id')
      .eq('scope_id', scope.id);
    const intentIds = (intents || []).map(row => row.id);
    if (intentIds.length > 0) {
      await supabaseServer.from('bot_responses').delete().in('intent_id', intentIds);
      await supabaseServer.from('intent_configurations').delete().in('id', intentIds);
    }
    await supabaseServer.from('scopes').delete().eq('id', scope.id);
    scopeRepository.invalidateCache();
    intentDetectionService.invalidateAll();
  }
}

async function main(): Promise<void> {
  const { supabaseServer } = await import('../src/services/supabase/server-client');
  const { resourceRepository } = await import('../src/data/repositories/resource.repository');
  const { appointmentRepository } = await import('../src/data/repositories/appointment.repository');

  const output: unknown[] = [];
  await verifyDetectionAgainstOwnData(output);

  const resourceCategory = `baseline_resource_${Date.now().toString(36)}`;
  const { data: createdResources, error: resourceInsertError } = await supabaseServer
    .from('resources')
    .insert(Array.from({ length: baseline.resourceSetSize }, (_, index) => ({
      scope_id: baseline.rootScopeId,
      resource_type: 'document',
      intent_category: resourceCategory,
      title: `Baseline resource ${index + 1}`,
      file_url: `https://example.com/baseline-${index + 1}.pdf`,
    })))
    .select('id');
  if (resourceInsertError) throw resourceInsertError;

  try {
    const visibleResources = await resourceRepository.getVisible(baseline.rootScopeId);
    const resourceSet = visibleResources.filter(
      resource => resource.intent_category === resourceCategory
    );
    if (resourceSet.length !== baseline.resourceSetSize) {
      throw new Error(`Expected ${baseline.resourceSetSize} resources in the root set`);
    }
    output.push({ resourceCategory, resourceCount: resourceSet.length });
  } finally {
    await supabaseServer
      .from('resources')
      .delete()
      .in('id', createdResources.map(resource => resource.id));
  }

  // La configuracion del asesor se establece aqui a proposito. Antes, la linea
  // base registraba como valor esperado el numero sembrado por la migracion 007
  // ('+529933906926', marcado en esa migracion como numero de prueba), asi que
  // verificaba justamente la falla que habia que corregir: agent_config opacando
  // al valor que el administrador configura en Ajustes.
  //
  // Ahora se configura bot_config, que es la fuente de verdad, y se comprueba
  // que la resolucion lo respeta. Una base sin configurar no resuelve telefono y
  // lanza error: ese caso lo cubre test-advisor-config-precedence.ts.
  const { data: previousPhone } = await supabaseServer
    .from('bot_config')
    .select('config_value')
    .eq('config_key', 'advisor_phone')
    .single();

  await supabaseServer
    .from('bot_config')
    .update({ config_value: baseline.configuration.advisorPhone })
    .eq('config_key', 'advisor_phone');

  const agent = await appointmentRepository.getDefaultAgent(baseline.rootScopeId);
  const timeSlots = await appointmentRepository.getTimeSlots(baseline.rootScopeId);

  await supabaseServer
    .from('bot_config')
    .update({ config_value: previousPhone?.config_value ?? '' })
    .eq('config_key', 'advisor_phone');
  if (agent.advisor_phone !== baseline.configuration.advisorPhone) {
    throw new Error(`Expected baseline advisor phone ${baseline.configuration.advisorPhone}`);
  }
  if (agent.name !== baseline.configuration.advisorName) {
    throw new Error(`Expected baseline advisor name ${baseline.configuration.advisorName}`);
  }
  if (agent.advisor_email !== baseline.configuration.advisorEmail) {
    throw new Error(`Expected baseline advisor email ${baseline.configuration.advisorEmail}`);
  }
  if (agent.business_hours !== baseline.configuration.businessHours) {
    throw new Error(`Expected baseline business hours ${baseline.configuration.businessHours}`);
  }
  const timeSlotKeys = timeSlots.map(slot => slot.time_slot);
  if (JSON.stringify(timeSlotKeys) !== JSON.stringify(baseline.configuration.timeSlots)) {
    throw new Error(`Expected baseline time slots ${baseline.configuration.timeSlots.join(', ')}`);
  }
  output.push({
    advisorPhone: agent.advisor_phone,
    advisorName: agent.name,
    advisorEmail: agent.advisor_email,
    businessHours: agent.business_hours,
    timeSlots: timeSlotKeys,
  });

  console.log(JSON.stringify(output, null, 2));
  console.log('Single-scope baseline verified');
}

main().catch(error => {
  console.error('Baseline verification failed:', error);
  process.exit(1);
});
