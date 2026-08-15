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

async function main(): Promise<void> {
  const { supabaseServer } = await import('../src/services/supabase/server-client');
  const { intentDetectionService } = await import('../src/core/intent-engine/intent-detection.service');
  const { conversationRepository } = await import('../src/data/repositories/conversation.repository');
  const { resourceRepository } = await import('../src/data/repositories/resource.repository');
  const { appointmentRepository } = await import('../src/data/repositories/appointment.repository');

  const output = [];
  for (const testCase of baseline.cases) {
    const detection = await intentDetectionService.detect(
      testCase.message,
      supabaseServer,
      baseline.rootScopeId
    );
    const responses = detection.intent
      ? await conversationRepository.getBotResponses(detection.intent.intent_id)
      : [];

    output.push({
      message: testCase.message,
      intent: detection.intent?.intent_name || null,
      responses,
    });

    if (detection.intent?.intent_name !== testCase.intent) {
      throw new Error(`Expected ${testCase.intent} for "${testCase.message}"`);
    }
    if (responses.length !== testCase.responseCount) {
      throw new Error(`Expected ${testCase.responseCount} responses for ${testCase.intent}`);
    }
  }

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
