/**
 * API de Testing - Procesa mensajes sin WhatsApp real
 */

import { NextRequest, NextResponse } from 'next/server';
import { messageProcessor } from '@/core/conversation/message-processor';

export async function POST(request: NextRequest) {
  try {
    const { phoneNumber, message, messageId } = await request.json();

    if (!phoneNumber || !message) {
      return NextResponse.json(
        { error: 'phoneNumber and message are required' },
        { status: 400 }
      );
    }

    console.log(`\n📨 [TEST] Procesando mensaje de ${phoneNumber}: "${message}"`);

    // Procesar con el Message Processor real
    const result = await messageProcessor.processMessage(
      phoneNumber,
      message,
      messageId || `test_${Date.now()}`,
      'Usuario Test'
    );

    const { isFragmentedResponse, isSimpleResponseWithMedia } = await import('@/types/message-fragments.types');

    // Convertir responses a texto para logging
    const responseText = result.responses
      .map(r => {
        if (typeof r === 'string') return r;
        if (isFragmentedResponse(r)) return `[Fragmentado: ${r.fragments.length} partes]`;
        if (isSimpleResponseWithMedia(r)) return `[Media: ${r.media_type} - ${r.text}]`;
        return '[Desconocido]';
      })
      .join('\n---\n');

    console.log(`📤 [TEST] Respuesta: "${responseText.substring(0, 100)}..."`);
    console.log(`🎯 [TEST] Intent detectado: ${result.wasDetected ? 'SÍ' : 'NO'}`);
    console.log(`⚠️ [TEST] Es fallback: ${result.isFallback ? 'SÍ' : 'NO'}\n`);

    // Simular lógica del webhook: verificar si hay auto-offer pendiente
    const allResponses = [...result.responses];
    
    if (result.wasDetected && !result.isFallback) {
      const { supabaseServer } = await import('@/services/supabase/server-client');
      const { userRepository } = await import('@/data/repositories/user.repository');
      const { configRepository } = await import('@/data/repositories/config.repository');
      
      // Obtener usuario
      const { data: user } = await supabaseServer
        .from('users')
        .select('id')
        .eq('phone_number', phoneNumber)
        .single();
      
      if (user) {
        // Verificar estado de auto-offer
        const flowState = await userRepository.getAppointmentFlowState(user.id);
        
        if (flowState === 'pending_auto_offer') {
          // Verificar que no hayamos enviado el auto-offer ya
          const { data: lastMessage } = await supabaseServer
            .from('conversation_messages')
            .select('message_text')
            .eq('user_id', user.id)
            .eq('is_from_user', false)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          
          const appointmentOffer = await configRepository.get(
            'auto_offer_message',
            '¡Veo que estás muy interesado! 🎉 ¿Te gustaría agendar una visita para conocer el fraccionamiento en persona?'
          );
          
          // Solo agregar si el último mensaje NO es el auto-offer
          if (!lastMessage || !lastMessage.message_text.includes('¡Veo que estás muy interesado!')) {
            console.log(`📤 [TEST] Agregando auto-offer pendiente a las respuestas`);
            allResponses.push(appointmentOffer);
          }
        }
        
        // Si el estado es ask_time, agregar pregunta con botones
        // Similar al patrón de auto-offer
        if (flowState === 'ask_time') {
          // Verificar que no hayamos enviado ya la pregunta
          const { data: lastMessage } = await supabaseServer
            .from('conversation_messages')
            .select('message_text')
            .eq('user_id', user.id)
            .eq('is_from_user', false)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          
          // Solo agregar si el último mensaje NO es la pregunta de horario
          if (!lastMessage || !lastMessage.message_text.includes('¿En qué horario prefieres')) {
            console.log(`📤 [TEST] Agregando pregunta de horario con botones`);
            allResponses.push('¿En qué horario prefieres visitarnos?');
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      responses: allResponses,
      wasDetected: result.wasDetected,
      isFallback: result.isFallback,
      intent: result.wasDetected ? 'detected' : null,
      confidence: result.wasDetected ? 0.95 : 0
    });

  } catch (error) {
    console.error('❌ [TEST] Error:', error);
    
    return NextResponse.json(
      { 
        error: 'Error processing message',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
