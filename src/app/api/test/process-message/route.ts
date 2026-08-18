import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { messageProcessor } from '@/core/conversation/message-processor';
import { conversationSimulatorRepository } from '@/data/repositories/conversation-simulator.repository';
import { conversationRepository } from '@/data/repositories/conversation.repository';
import { scopeRepository } from '@/data/repositories/scope.repository';
import { userRepository } from '@/data/repositories/user.repository';
import { getAuthenticatedAdmin } from '@/lib/server/authenticated-admin';
import { offerButtons } from '@/core/conversation/pending-offer-messages';
import {
  isFragmentedResponse,
  isSimpleResponseWithMedia,
  type BotResponse,
  type MessageFragment,
} from '@/types/message-fragments.types';

const requestSchema = z.object({
  phoneNumber: z.string().trim().min(4).max(20),
  message: z.string().trim().min(1).max(4096),
  messageId: z.string().trim().min(1).optional(),
  scopeId: z.string().uuid().optional(),
  referralAdId: z.string().trim().min(1).max(255).optional(),
});

function fragmentText(fragment: MessageFragment): string {
  if (fragment.type === 'text') return fragment.content;
  if (fragment.type === 'location') return `${fragment.name}\n${fragment.address}`;
  if (fragment.type === 'contact') return `${fragment.name}\n${fragment.phone}`;
  if ('caption' in fragment && fragment.caption) return fragment.caption;
  if ('filename' in fragment) return fragment.filename;
  return `[${fragment.type}]`;
}

function flattenResponses(responses: BotResponse[]): string[] {
  return responses.flatMap(response => {
    if (typeof response === 'string') return [response];
    if (isFragmentedResponse(response)) return response.fragments.map(fragmentText);
    if (isSimpleResponseWithMedia(response)) {
      return response.text ? [response.text, `[${response.media_type || 'archivo'}]`] : [`[${response.media_type || 'archivo'}]`];
    }
    return [];
  });
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!await getAuthenticatedAdmin(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const input = requestSchema.parse(await request.json());
    if (input.scopeId && !await scopeRepository.isActiveScope(input.scopeId)) {
      return NextResponse.json({ error: 'El alcance debe estar activo' }, { status: 400 });
    }

    const user = await userRepository.findOrCreateSimulatedByPhone(
      input.phoneNumber,
      `Simulación ${input.phoneNumber.slice(-4)}`
    );
    const result = await messageProcessor.processMessage(
      input.phoneNumber,
      input.message,
      input.messageId || `simulator_${Date.now()}`,
      user.name,
      {
        scopeId: input.scopeId,
        referralAdId: input.referralAdId,
        suppressExternalMessages: true,
      }
    );
    if (result.error) throw new Error(result.error);
    // La misma condicion con la que el webhook decide si toca emitir el
    // siguiente mensaje del flujo de cita.
    const flowMessage = result.wasDetected && !result.isFallback && !result.flowHandled
      ? await conversationSimulatorRepository.getPendingFlowMessage(user.id)
      : null;
    const messages = [
      ...flattenResponses(result.responses),
      ...(flowMessage ? [flowMessage.bodyText] : []),
    ];
    for (const responseMessage of messages) {
      await conversationRepository.saveOutgoingMessage(
        user.id,
        responseMessage,
        result.isFallback,
        undefined,
        result.scopeId
      );
    }
    const diagnostic = await conversationSimulatorRepository.getDiagnostic(user.id, result.scopeId);

    // Las opciones de una enumeracion viajan en la oferta pendiente, no en el
    // texto: sin esto el simulador enseñaba "¿De cual desarrollo?" sin ninguna
    // opcion, mientras WhatsApp recibia los botones. El transporte cambia, lo
    // que se ofrece no. Tocar un boton manda su `id`, que es la misma via
    // determinista que usa `button_reply` en el webhook.
    const enumerationButtons = flowMessage
      ? []
      : await offerButtons(user.id, messages[messages.length - 1] ?? '');

    return NextResponse.json({
      success: true,
      responses: result.responses,
      messages,
      wasDetected: result.wasDetected,
      isFallback: result.isFallback,
      intent: result.detectedIntent?.intent_name || (result.flowHandled ? 'appointment_flow' : null),
      intentId: result.detectedIntent?.intent_id || null,
      buttons: flowMessage?.buttons ?? enumerationButtons,
      // Parte del contrato del endpoint desde antes del simulador: hay pruebas
      // que comprueban contra que alcance se resolvio la respuesta.
      scopeId: result.scopeId || null,
      diagnostic,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Solicitud inválida' }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    const status = message.includes('lead real') ? 409 : 500;
    console.error('[ConversationSimulator] Error processing message:', error);
    return NextResponse.json({ error: message }, { status });
  }
}
