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

      // Enviar cada respuesta (puede ser simple o fragmentada)
      for (const botResponse of response.responses) {
        if (typeof botResponse === 'string') {
          // Respuesta simple: enviar texto
          console.log(`📤 Enviando texto: "${botResponse.substring(0, 50)}..."`);
          
          await whatsappSender.sendTextMessage({
            to: from,
            message: botResponse
          });

          // Guardar en BD
          if (user) {
            await conversationRepository.saveOutgoingMessage(
              user.id,
              botResponse,
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
