/**
 * WhatsApp Webhook - Recibe mensajes de WhatsApp Business API
 * POST /api/webhook/whatsapp - Recibir mensajes
 * GET /api/webhook/whatsapp - Verificación del webhook
 */

import { NextRequest, NextResponse } from 'next/server';
import { webhookValidator } from '@/services/whatsapp/webhook-validator';
import { whatsappSender } from '@/services/whatsapp/message-sender';
import { messageProcessor } from '@/core/conversation/message-processor';
import { conversationRepository } from '@/data/repositories/conversation.repository';
import { isSimpleResponseWithMedia } from '@/types/message-fragments.types';

/**
 * GET - Verificación del webhook (requerido por Meta)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token) {
    if (webhookValidator.validateVerifyToken(token)) {
      console.log('Webhook verified successfully');
      return new NextResponse(challenge, { status: 200 });
    } else {
      console.error('Verification token mismatch');
      return NextResponse.json({ error: 'Invalid verify token' }, { status: 403 });
    }
  }

  return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
}

/**
 * POST - Recibir mensajes entrantes
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validar que sea un mensaje de WhatsApp válido
    if (!webhookValidator.isValidWhatsAppMessage(body)) {
      return NextResponse.json({ status: 'ignored' }, { status: 200 });
    }

    // Extraer información del mensaje
    const messageData = webhookValidator.extractMessage(body);
    
    if (!messageData) {
      return NextResponse.json({ status: 'no_message' }, { status: 200 });
    }

    const { from, messageId, text, name } = messageData;

    console.log(`📨 Mensaje recibido de ${from}: "${text}"`);

    // Marcar como leído inmediatamente
    await whatsappSender.markAsRead(messageId);

    // Procesar mensaje con el cerebro del bot
    const response = await messageProcessor.processMessage(from, text, messageId, name);

    // Enviar respuesta(s) si es necesario
    if (response.shouldSend && response.responses && response.responses.length > 0) {
      const { isFragmentedResponse } = await import('@/types/message-fragments.types');
      
      // Obtener userId desde el phone number (para guardar en BD)
      const { supabaseServer } = await import('@/services/supabase/server-client');
      const { data: user } = await supabaseServer
        .from('users')
        .select('id')
        .eq('phone_number', from)
        .single();

      // Enviar cada respuesta (puede ser simple, con media o fragmentada)
      for (const botResponse of response.responses) {
        if (typeof botResponse === 'string') {
          // Verificar si es el mensaje de selección de horario y enviar con botones
          const isTimeSelection = botResponse.includes('¿En qué momento del día') || 
                                 botResponse.includes('momento del día prefieres');
          
          if (isTimeSelection) {
            console.log(`📤 Enviando selección de horario con botones`);
            
            await whatsappSender.sendInteractiveButtons({
              to: from,
              bodyText: botResponse,
              buttons: [
                { id: 'morning', title: 'Mañana' },
                { id: 'afternoon', title: 'Tarde' },
                { id: 'evening', title: 'Noche' }
              ]
            });
          } else {
            // Respuesta simple normal: enviar texto
            console.log(`📤 Enviando texto: "${botResponse.substring(0, 50)}..."`);
            
            await whatsappSender.sendTextMessage({
              to: from,
              message: botResponse
            });
          }

          // Guardar en BD
          if (user) {
            await conversationRepository.saveOutgoingMessage(
              user.id,
              botResponse,
              response.isFallback
            );
          }

        } else if (isSimpleResponseWithMedia(botResponse)) {
          // Respuesta con archivo adjunto
          console.log(`📤 Enviando respuesta con media: ${botResponse.media_type} - ${botResponse.media_url}`);
          
          // 1. Enviar texto primero (si hay)
          if (botResponse.text && botResponse.text.trim()) {
            await whatsappSender.sendTextMessage({
              to: from,
              message: botResponse.text
            });
            
            // Pequeño delay para que lleguen en orden
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          
          // 2. Enviar archivo según su tipo
          const mediaType = botResponse.media_type;
          const mediaUrl = botResponse.media_url;
          
          // Extraer nombre de archivo limpio (sin timestamp)
          const rawFileName = mediaUrl.split('/').pop() || 'archivo';
          // Remover timestamp al inicio (formato: 1763590848232_nombre.pdf -> nombre.pdf)
          const fileName = rawFileName.replace(/^\d+_/, '') || rawFileName;
          
          if (mediaType === 'image') {
            await whatsappSender.sendImage(from, mediaUrl);
          } else if (mediaType === 'document') {
            await whatsappSender.sendDocument(from, mediaUrl, fileName);
          } else if (mediaType === 'video') {
            await whatsappSender.sendVideo(from, mediaUrl);
          } else {
            // Tipo desconocido, intentar como documento
            console.warn(`⚠️ Tipo de media desconocido: ${mediaType}, enviando como documento`);
            await whatsappSender.sendDocument(from, mediaUrl, fileName);
          }
          
          // Guardar en BD
          if (user) {
            const messageText = botResponse.text 
              ? `${botResponse.text}\n[Archivo adjunto: ${mediaUrl}]`
              : `[Archivo adjunto: ${mediaUrl}]`;
            
            await conversationRepository.saveOutgoingMessage(
              user.id,
              messageText,
              response.isFallback
            );
          }

        } else if (isFragmentedResponse(botResponse)) {
          // Respuesta fragmentada: enviar múltiples mensajes con delays
          console.log(`📤 Enviando respuesta fragmentada (${botResponse.fragments.length} fragmentos)`);
          
          const messageIds = await whatsappSender.sendFragmentedMessage(
            from,
            botResponse.fragments
          );

          // Guardar cada fragmento en BD
          if (user) {
            for (const fragment of botResponse.fragments) {
              const textContent = fragment.type === 'text' 
                ? fragment.content 
                : `[${fragment.type}]`;
              
              await conversationRepository.saveOutgoingMessage(
                user.id,
                textContent,
                response.isFallback
              );
            }
          }
        }
      }
      
      // DESPUÉS de enviar las respuestas normales, verificar si hay auto-offer pendiente
      if (user) {
        const { userRepository } = await import('@/data/repositories/user.repository');
        const { configRepository } = await import('@/data/repositories/config.repository');
        
        // Obtener estado Y progreso
        const flowState = await userRepository.getAppointmentFlowState(user.id);
        const progress = await userRepository.getProgress(user.id);
        
        // Si el estado es pending_auto_offer
        // Y el último mensaje del bot NO fue el auto-offer (para evitar duplicados)
        if (flowState === 'pending_auto_offer' && 
            response.wasDetected && 
            !response.isFallback) {
          
          // Verificar si el último mensaje enviado YA fue el auto-offer
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
          
          // Solo enviar si el último mensaje NO es el auto-offer
          if (!lastMessage || !lastMessage.message_text.includes('¡Veo que estás muy interesado!')) {
            console.log(`📤 Enviando auto-offer con botones después de confirmar estado en BD`);
            
            // Esperar 300ms para asegurar consistencia en BD
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Enviar con botones interactivos
            await whatsappSender.sendInteractiveButtons({
              to: from,
              bodyText: appointmentOffer,
              buttons: [
                { id: 'appointment_yes', title: 'Sí, me interesa' },
                { id: 'appointment_no', title: 'No, gracias' }
              ]
            });
            
            await conversationRepository.saveOutgoingMessage(
              user.id,
              appointmentOffer,
              false
            );
          }
        }
        
        // Si el estado es ask_time, enviar pregunta con botones de horario
        // Similar al patrón de auto-offer
        if (flowState === 'ask_time' && 
            response.wasDetected && 
            !response.isFallback) {
          
          // Verificar que no hayamos enviado ya la pregunta
          const { data: lastMessage } = await supabaseServer
            .from('conversation_messages')
            .select('message_text')
            .eq('user_id', user.id)
            .eq('is_from_user', false)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          
          // Solo enviar si el último mensaje NO es la pregunta de horario
          if (!lastMessage || !lastMessage.message_text.includes('¿En qué horario prefieres')) {
            console.log(`📤 Enviando pregunta de horario con botones después de confirmar estado en BD`);
            
            // Esperar 300ms para asegurar consistencia en BD
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Enviar con botones interactivos
            await whatsappSender.sendInteractiveButtons({
              to: from,
              bodyText: '¿En qué horario prefieres visitarnos?',
              buttons: [
                { id: 'morning', title: 'Mañana' },
                { id: 'afternoon', title: 'Tarde' },
                { id: 'evening', title: 'Noche' }
              ]
            });
            
            await conversationRepository.saveOutgoingMessage(
              user.id,
              '¿En qué horario prefieres visitarnos?',
              false
            );
          }
        }
      }
    }

    return NextResponse.json({ 
      status: 'received',
      processed: response.wasDetected 
    }, { status: 200 });

  } catch (error) {
    console.error('Error processing webhook:', error);
    
    // Siempre retornar 200 para que Meta no reintente
    return NextResponse.json({ 
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 200 });
  }
}
