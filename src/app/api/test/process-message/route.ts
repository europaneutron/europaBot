/**
 * API de Testing - Procesa mensajes sin WhatsApp real
 * Bloqueado en produccion por seguridad
 */

import { NextRequest, NextResponse } from 'next/server';
import { messageProcessor } from '@/core/conversation/message-processor';
import { scopeRepository } from '@/data/repositories/scope.repository';
import { z } from 'zod';

const processMessageRequestSchema = z.object({
  phoneNumber: z.string().min(1),
  message: z.string().min(1),
  messageId: z.string().min(1).optional(),
  scopeId: z.string().uuid().nullable().optional(),
});

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  try {
    const parsedRequest = processMessageRequestSchema.safeParse(await request.json());

    if (!parsedRequest.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsedRequest.error.flatten() },
        { status: 400 }
      );
    }

    const { phoneNumber, message, messageId, scopeId } = parsedRequest.data;
    if (scopeId === null) {
      return NextResponse.json(
        { error: 'scopeId cannot be null; omit it to use the root scope' },
        { status: 400 }
      );
    }

    if (scopeId !== undefined && !(await scopeRepository.isActiveScope(scopeId))) {
      return NextResponse.json(
        { error: 'scopeId must reference an active scope' },
        { status: 400 }
      );
    }

    console.log(`\n📨 [TEST] Procesando mensaje de ${phoneNumber}: "${message}"`);

    // Procesar con el Message Processor real
    const result = await messageProcessor.processMessage(
      phoneNumber,
      message,
      messageId || `test_${Date.now()}`,
      'Usuario Test',
      scopeId
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
            .from('conversations')
            .select('message_text')
            .eq('user_id', user.id)
            .eq('direction', 'outbound')
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
        
        // Si el estado es confirm_date, agregar confirmación
        if (flowState === 'confirm_date') {
          const { data: lastMessage } = await supabaseServer
            .from('conversations')
            .select('message_text')
            .eq('user_id', user.id)
            .eq('direction', 'outbound')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          
          if (!lastMessage || !lastMessage.message_text.includes('¿Es correcto?')) {
            const flowData = await userRepository.getAppointmentFlowData(user.id);
            const requestedDate = flowData?.requested_date;
            
            if (requestedDate) {
              const dateObj = new Date(requestedDate + 'T00:00:00');
              const dateText = dateObj.toLocaleDateString('es-MX', { 
                weekday: 'long', 
                day: 'numeric', 
                month: 'long' 
              });
              
              console.log(`📤 [TEST] Agregando confirmación de fecha`);
              allResponses.push(
                `📅 Entendido, quieres visitarnos el *${dateText}*.\n\n¿Es correcto?\n\n[Sí, continuar] [Cambiar fecha]`
              );
            }
          }
        }
        
        // Si el estado es ask_time, agregar pregunta con botones
        if (flowState === 'ask_time') {
          const { data: lastMessage } = await supabaseServer
            .from('conversations')
            .select('message_text')
            .eq('user_id', user.id)
            .eq('direction', 'outbound')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          
          if (!lastMessage || !lastMessage.message_text.includes('¿En qué horario prefieres')) {
            console.log(`📤 [TEST] Agregando pregunta de horario`);
            allResponses.push('¿En qué horario prefieres visitarnos?\n\n[Mañana 9-12] [Tarde 12-15] [Noche 15-18]');
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      responses: allResponses,
      wasDetected: result.wasDetected,
      isFallback: result.isFallback,
      intent: result.detectedIntent?.intent_name || null,
      intentId: result.detectedIntent?.intent_id || null,
      scopeId: result.detectedIntent?.scope_id || null,
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
