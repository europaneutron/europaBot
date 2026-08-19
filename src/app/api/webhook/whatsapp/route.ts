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
import { currentOfferPresentation } from '@/core/conversation/pending-offer-messages';

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
    // Leer raw body como Buffer para validar firma HMAC
    // Buffer evita re-codificacion UTF-8 que puede alterar los bytes firmados por Meta
    const rawBuffer = Buffer.from(await request.arrayBuffer());
    const rawBody = rawBuffer.toString('utf-8');
    const signature = request.headers.get('x-hub-signature-256');

    console.log('[Webhook] signature header:', signature ? signature.slice(0, 20) + '...' : 'AUSENTE');
    console.log('[Webhook] APP_SECRET configurado:', !!process.env.WHATSAPP_APP_SECRET);
    console.log('[Webhook] rawBody length:', rawBuffer.length);
    console.log('[Webhook] rawBody preview:', rawBody.slice(0, 50));

    if (!webhookValidator.validateSignature(rawBuffer, signature)) {
      console.error('[Webhook] Firma invalida - request rechazado');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }

    const body = JSON.parse(rawBody);

    // Validar que sea un mensaje de WhatsApp válido
    if (!webhookValidator.isValidWhatsAppMessage(body)) {
      return NextResponse.json({ status: 'ignored' }, { status: 200 });
    }

    // Extraer información del mensaje
    const messageData = webhookValidator.extractMessage(body);
    
    if (!messageData) {
      return NextResponse.json({ status: 'no_message' }, { status: 200 });
    }

    const { from, messageId, text, name, referralAdId } = messageData;

    console.log(`📨 Mensaje recibido de ${from}: "${text}"`);

    // Marcar como leído inmediatamente
    await whatsappSender.markAsRead(messageId);

    // Procesar mensaje con el cerebro del bot
    const response = await messageProcessor.processMessage(
      from,
      text,
      messageId,
      name,
      { referralAdId }
    );

    // Obtener userId SIEMPRE (necesario para verificar flow state)
    const { supabaseServer } = await import('@/services/supabase/server-client');
    const { data: user } = await supabaseServer
      .from('users')
      .select('id')
      .eq('phone_number', from)
      .single();

    // Enviar respuesta(s) si es necesario
    if (response.shouldSend && response.responses && response.responses.length > 0) {
      const { isFragmentedResponse } = await import('@/types/message-fragments.types');

      // Enviar cada respuesta (puede ser simple, con media o fragmentada)
      for (const botResponse of response.responses) {
        if (typeof botResponse === 'string') {
          // Verificar si es el mensaje de selección de horario y enviar con botones
          const isTimeSelection = botResponse.includes('¿En qué momento del día') ||
                                 botResponse.includes('momento del día prefieres');

          // Una enumeración viva de dos o más opciones se manda como botones
          // o lista interactiva, no como el texto plano que ya se guarda en
          // BD: es el mismo texto, la única diferencia es el transporte.
          const offerPresentation = user
            ? await currentOfferPresentation(user.id, botResponse)
            : null;

          // Una respuesta que no cabe en el cuerpo interactivo viaja en dos
          // piezas: el texto suelto y despues el cierre con los botones. La
          // API rechaza el envio entero si el cuerpo pasa de 1024, asi que sin
          // esto el lead se quedaba sin ninguna de las dos.
          if (offerPresentation?.precedingText) {
            await whatsappSender.sendTextMessage({
              to: from,
              message: offerPresentation.precedingText,
            });
          }

          if (offerPresentation?.format === 'buttons') {
            console.log(`📤 Enviando desambiguación con botones`);
            await whatsappSender.sendInteractiveButtons({
              to: from,
              bodyText: offerPresentation.bodyText,
              buttons: offerPresentation.buttons,
            });
          } else if (offerPresentation?.format === 'list') {
            console.log(`📤 Enviando desambiguación con lista`);
            await whatsappSender.sendListMessage({
              to: from,
              bodyText: offerPresentation.bodyText,
              buttonText: offerPresentation.buttonText,
              rows: offerPresentation.rows,
            });
          } else if (isTimeSelection) {
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
              response.isFallback,
              undefined,
              response.scopeId
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
            await whatsappSender.sendDocument(from, mediaUrl, fileName, fileName);
          } else if (mediaType === 'video') {
            await whatsappSender.sendVideo(from, mediaUrl);
          } else {
            // Tipo desconocido, intentar como documento
            console.warn(`Tipo de media desconocido: ${mediaType}, enviando como documento`);
            await whatsappSender.sendDocument(from, mediaUrl, fileName, fileName);
          }
          
          // Guardar en BD
          if (user) {
            const messageText = botResponse.text 
              ? `${botResponse.text}\n[Archivo adjunto: ${mediaUrl}]`
              : `[Archivo adjunto: ${mediaUrl}]`;
            
            await conversationRepository.saveOutgoingMessage(
              user.id,
              messageText,
              response.isFallback,
              undefined,
              response.scopeId
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
                response.isFallback,
                undefined,
                response.scopeId
              );
            }
          }
        }
      }
    }
      
    // DESPUÉS de enviar las respuestas normales, verificar si hay flow states pendientes
    // IMPORTANTE: Solo ejecutar si el message-processor NO manejó ya un flow state
    // flowHandled indica que ya se procesó un flow y no debemos verificar de nuevo
    if (user && response.wasDetected && !response.isFallback && !response.flowHandled) {
      const { userRepository } = await import('@/data/repositories/user.repository');
      const { configRepository } = await import('@/data/repositories/config.repository');
      
      // El mensaje con botones que toque a continuacion, compuesto en un solo
      // lugar y compartido con el simulador. Ver appointment-flow-messages.ts:
      // tenerlo aqui dentro obligaba a copiarlo para cualquier otro consumidor.
      const { nextAppointmentFlowMessage } = await import('@/core/appointment/appointment-flow-messages');
      const flowMessage = await nextAppointmentFlowMessage(user.id);

      if (flowMessage) {
        console.log('Enviando mensaje del flujo de cita con botones');
        // Margen para que el estado ya este consolidado en la base.
        await new Promise(resolve => setTimeout(resolve, 300));

        await whatsappSender.sendInteractiveButtons({
          to: from,
          bodyText: flowMessage.bodyText,
          buttons: flowMessage.buttons,
        });

        await conversationRepository.saveOutgoingMessage(
          user.id,
          flowMessage.bodyText,
          false,
          undefined,
          response.scopeId
        );
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
