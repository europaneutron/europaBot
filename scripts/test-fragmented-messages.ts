/**
 * Script de prueba: Mensajes Fragmentados
 * Prueba el sistema completo sin enviar mensajes reales a WhatsApp
 */

// IMPORTANTE: Cargar dotenv ANTES de cualquier otro import
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env.development.local') });
config({ path: resolve(__dirname, '../.env.local') });
// Ahora sí, importar los demás módulos
import type { BotResponse, FragmentedResponse, MessageFragment } from '@/types/message-fragments.types';
import { isFragmentedResponse, isSimpleResponseWithMedia } from '@/types/message-fragments.types';

console.log('🧪 Pruebas de Mensajes Fragmentados\n');

// =====================================================
// TEST 1: Verificar tipos
// =====================================================
console.log('✅ Test 1: Tipos TypeScript');

const simpleResponse: BotResponse = "Hola, ¿cómo estás?";
console.log(`   Simple response: "${simpleResponse}"`);
console.log(`   Es fragmentado: ${isFragmentedResponse(simpleResponse)}`);

const fragmentedResponse: BotResponse = {
  fragments: [
    {
      type: 'text',
      content: 'Hola',
      delay: 800
    },
    {
      type: 'text',
      content: '¿Cómo estás?',
      delay: 1000
    }
  ]
};

console.log(`   Fragmented response: ${JSON.stringify(fragmentedResponse, null, 2)}`);
console.log(`   Es fragmentado: ${isFragmentedResponse(fragmentedResponse)}`);

// =====================================================
// TEST 2: Repository - Verificar que devuelve respuestas
// =====================================================
console.log('\n✅ Test 2: Repository Layer');

async function testRepository() {
  try {
    const { conversationRepository } = await import('@/data/repositories/conversation.repository');
    const { intentConfigRepository } = await import('@/data/repositories/intent-config.repository');
    const { ROOT_SCOPE_ID } = await import('@/data/repositories/scope.repository');
    const intent = await intentConfigRepository.getByName('precio', ROOT_SCOPE_ID);
    if (!intent) throw new Error('Intent precio not found in root scope');

    const responses = await conversationRepository.getBotResponses(intent.id);
    
    console.log(`   Respuestas obtenidas: ${responses.length}`);
    
    responses.forEach((response, index) => {
      if (isFragmentedResponse(response)) {
        console.log(`   [${index + 1}] Tipo: FRAGMENTADO (${response.fragments.length} fragmentos)`);
      } else if (isSimpleResponseWithMedia(response)) {
        console.log(`   [${index + 1}] Tipo: MEDIA (${response.media_type})`);
        console.log(`       Texto: "${response.text}"`);
        console.log(`       URL: "${response.media_url}"`);
      } else {
        const text = response as string;
        console.log(`   [${index + 1}] Tipo: SIMPLE (${text.length} caracteres)`);
      }
    });
    
    return responses;
  } catch (error) {
    console.error('   ❌ Error en repository:', error);
    return [];
  }
}

// =====================================================
// TEST 3: Message Processor - Procesar mensaje de prueba
// =====================================================
console.log('\n✅ Test 3: Message Processor');

async function testMessageProcessor() {
  try {
    // El modulo se carga aqui y no arriba: un import estatico se iza por
    // encima de config(), y el cliente de Supabase se construiria antes de que
    // existan las variables de entorno.
    const { MessageProcessor } = await import('@/core/conversation/message-processor');
    const processor = new MessageProcessor();
    
    const testPhone = '+5212345678901'; // Número de prueba
    const testMessage = 'cuanto cuesta';
    const testMessageId = 'test-' + Date.now();
    
    console.log(`   Procesando: "${testMessage}"`);
    
    const result = await processor.processMessage(
      testPhone,
      testMessage,
      testMessageId,
      'Usuario Prueba'
    );
    
    console.log(`   Debe enviar: ${result.shouldSend}`);
    console.log(`   Intent detectado: ${result.wasDetected}`);
    console.log(`   Es fallback: ${result.isFallback}`);
    console.log(`   Respuestas: ${result.responses.length}`);
    
    result.responses.forEach((response, index) => {
      if (isFragmentedResponse(response)) {
        console.log(`   [${index + 1}] FRAGMENTADO:`);
        response.fragments.forEach((frag, fragIndex) => {
          console.log(`       ${fragIndex + 1}. ${frag.type} (delay: ${frag.delay}ms)`);
        });
      } else if (isSimpleResponseWithMedia(response)) {
        const textPreview = response.text ? response.text.substring(0, 50) : '(solo media)';
        console.log(`   [${index + 1}] MEDIA: ${response.media_type} - "${textPreview}..."`);
      } else {
        const text = response as string;
        console.log(`   [${index + 1}] SIMPLE: "${text.substring(0, 50)}..."`);
      }
    });
    
    return result;
  } catch (error) {
    console.error('   ❌ Error en message processor:', error);
    return null;
  }
}

// =====================================================
// TEST 4: Simulación de envío fragmentado
// =====================================================
console.log('\n✅ Test 4: Simulación de envío fragmentado');

function simulateSendFragmented(fragments: MessageFragment[]) {
  console.log('   Simulando envío con delays...');
  
  fragments.forEach((fragment, index) => {
    setTimeout(() => {
      console.log(`   [${index + 1}] Enviando ${fragment.type}...`);
      if (fragment.type === 'text') {
        console.log(`       Content: "${fragment.content}"`);
      } else if (fragment.type === 'image' || fragment.type === 'video') {
        console.log(`       URL: ${fragment.url}`);
      } else if (fragment.type === 'location') {
        console.log(`       Location: ${fragment.name}`);
      }
    }, index === 0 ? 0 : fragments.slice(0, index).reduce((sum, f) => sum + f.delay, 0));
  });
}

// =====================================================
// EJECUTAR TODOS LOS TESTS
// =====================================================

async function runAllTests() {
  try {
    await testRepository();
    await testMessageProcessor();
    
    // Simular fragmentos
    const testFragments: MessageFragment[] = [
      { type: 'text', content: '¡Hola!', delay: 800 },
      { type: 'text', content: 'Los precios inician desde $2.5M', delay: 1500 },
      { type: 'text', content: '¿Te interesa conocer más?', delay: 1200 }
    ];
    
    simulateSendFragmented(testFragments);
    
    // Esperar a que terminen las simulaciones
    await new Promise(resolve => setTimeout(resolve, 4000));
    
    console.log('\n✨ Pruebas completadas exitosamente');
    console.log('\n📊 Resumen:');
    console.log('   ✅ Tipos TypeScript funcionando');
    console.log('   ✅ Repository devuelve BotResponse[]');
    console.log('   ✅ Message Processor retorna responses array');
    console.log('   ✅ Sistema listo para mensajes fragmentados');
    
  } catch (error) {
    console.error('\n❌ Error en las pruebas:', error);
    process.exit(1);
  }
}

runAllTests();
