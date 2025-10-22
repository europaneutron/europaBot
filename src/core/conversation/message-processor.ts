/**
 * Message Processor - Procesador principal de mensajes
 * Orquesta todo el flujo: detección de intent, progreso, respuestas
 */

import { intentDetectionService } from '@/core/intent-engine';
import { userRepository } from '@/data/repositories/user.repository';
import { conversationRepository } from '@/data/repositories/conversation.repository';
import { supabaseServer } from '@/services/supabase/server-client';
import type { CheckpointKey } from '@/data/models/user.model';
import type { BotResponse } from '@/types/message-fragments.types';

export interface ProcessedResponse {
  responses: BotResponse[]; // Cambiado de 'message: string' a 'responses: BotResponse[]'
  shouldSend: boolean;
  wasDetected: boolean;
  isFallback: boolean;
}

export class MessageProcessor {
  /**
   * Procesar mensaje entrante
   */
  async processMessage(
    phoneNumber: string,
    messageText: string,
    messageId: string,
    userName?: string
  ): Promise<ProcessedResponse> {
    try {
      // 1. Buscar o crear usuario
      const user = await userRepository.findOrCreateByPhone(phoneNumber, userName);

      // 2. Verificar si el bot está activo para este usuario
      const isBotActive = await userRepository.isBotActive(user.id);
      if (!isBotActive) {
        return {
          responses: [],
          shouldSend: false,
          wasDetected: false,
          isFallback: false
        };
      }

      // 3. Actualizar última interacción
      await userRepository.updateLastInteraction(user.id);

      // 4. Detectar intención con fuzzy matching
      await intentDetectionService.loadIntents(supabaseServer);
      const detectionResult = await intentDetectionService.detect(messageText, supabaseServer);

      // 5. Guardar mensaje entrante
      const conversation = await conversationRepository.saveIncomingMessage(
        user.id,
        messageId,
        messageText,
        detectionResult.intent
      );

      // 6. Si no se detectó intención → Fallback
      if (!detectionResult.detected || !detectionResult.intent) {
        return await this.handleFallback(user.id, messageText);
      }

      // 7. Guardar log de intención
      await conversationRepository.saveIntentLog(
        user.id,
        conversation.id,
        detectionResult.intent,
        messageText,
        detectionResult.normalized_message
      );

      // 8. Resetear contador de fallback (tuvo éxito)
      await userRepository.resetFallbackAttempts(user.id);

      // 9. Procesar intención específica
      const responses = await this.handleIntent(user.id, detectionResult.intent.intent_name);

      return {
        responses,
        shouldSend: true,
        wasDetected: true,
        isFallback: false
      };

    } catch (error) {
      console.error('Error processing message:', error);
      return {
        responses: ['Disculpa, tuve un problema técnico. ¿Podrías repetir tu pregunta?'],
        shouldSend: true,
        wasDetected: false,
        isFallback: true
      };
    }
  }

  /**
   * Manejar intención detectada
   * Retorna array de BotResponse (pueden ser strings simples o fragmentados)
   */
  private async handleIntent(userId: string, intentName: string): Promise<BotResponse[]> {
    // Verificar si es checkpoint
    const checkpoints: CheckpointKey[] = ['precio', 'ubicacion', 'modelo', 'creditos', 'seguridad', 'brochure'];
    
    if (checkpoints.includes(intentName as CheckpointKey)) {
      // Verificar si ya completó este tema
      const isCompleted = await userRepository.isCheckpointCompleted(userId, intentName as CheckpointKey);
      
      if (isCompleted) {
        // Obtener respuesta y compartirla nuevamente con un mensaje amigable
        const responses = await conversationRepository.getBotResponses(intentName);
        
        if (responses.length > 0) {
          // Agregar mensaje amigable al inicio
          const friendlyMessage = 'Con gusto te la comparto nuevamente 😊';
          return [friendlyMessage, ...responses];
        }
      }

      // Marcar como completado (solo si no lo estaba antes)
      if (!isCompleted) {
        await userRepository.markCheckpointCompleted(userId, intentName as CheckpointKey);
        
        // Actualizar lead score SOLO cuando es nuevo
        const completedCount = await userRepository.countCompletedCheckpoints(userId);
        const newScore = completedCount * 15; // 15 puntos por checkpoint
        await userRepository.updateLeadScore(userId, newScore);
      }
    }

    // Obtener respuesta configurada desde BD
    const responses = await conversationRepository.getBotResponses(intentName);
    
    if (responses.length === 0) {
      return ['Gracias por tu interés. ¿En qué más puedo ayudarte?'];
    }

    // Verificar si debe ofrecer cita (4+ checkpoints completados)
    const completedCount = await userRepository.countCompletedCheckpoints(userId);
    const progress = await userRepository.getProgress(userId);

    if (completedCount >= 4 && !progress?.appointment_offered) {
      // Agregar mensaje de cita al final
      const appointmentOffer = '📅 Veo que ya tienes buena información del proyecto. ¿Te gustaría agendar una visita para conocerlo personalmente?';
      await userRepository.markAppointmentOffered(userId);
      return [...responses, appointmentOffer];
    }

    return responses;
  }

  /**
   * Manejar fallback (mensaje no entendido)
   */
  private async handleFallback(userId: string, messageText: string): Promise<ProcessedResponse> {
    const currentAttempts = await userRepository.incrementFallbackAttempts(userId);

    let fallbackMessage: string;

    switch (currentAttempts) {
      case 1:
        // Nivel 1: Pregunta de clarificación
        fallbackMessage = 
          '🤔 Disculpa, no estoy seguro de entender.\n\n' +
          '¿Preguntas sobre:\n' +
          '• Precios y costos\n' +
          '• Ubicación del proyecto\n' +
          '• Modelos de casas\n' +
          '• Opciones de crédito\n' +
          '• Seguridad\n' +
          '• Información general (brochure)\n\n' +
          'Por favor, repite tu pregunta con otras palabras.';
        break;

      case 2:
        // Nivel 2: Menú más específico
        fallbackMessage =
          'Te muestro las opciones principales:\n\n' +
          '1️⃣ Precio - Costo de lotes y casas\n' +
          '2️⃣ Ubicación - Dirección y cómo llegar\n' +
          '3️⃣ Modelos - Tipos de casas disponibles\n' +
          '4️⃣ Créditos - Financiamiento e Infonavit\n' +
          '5️⃣ Seguridad - Vigilancia del fraccionamiento\n' +
          '6️⃣ Brochure - Información completa en PDF\n\n' +
          'Escribe el número o el nombre del tema que te interesa.';
        break;

      case 3:
      default:
        // Nivel 3: Derivar a asesor humano
        fallbackMessage =
          'Veo que necesitas información más específica.\n\n' +
          '👨‍💼 Te voy a conectar con uno de nuestros asesores para que te ayude personalmente.\n\n' +
          '¿Cuál es tu nombre completo?';
        
        // Marcar para control manual
        await supabaseServer
          .from('bot_status')
          .update({ 
            is_active: false,
            paused_reason: 'fallback_limit_reached'
          })
          .eq('user_id', userId);
        break;
    }

    // Guardar mensaje de fallback
    await conversationRepository.saveOutgoingMessage(
      userId,
      fallbackMessage,
      true,
      currentAttempts
    );

    return {
      responses: [fallbackMessage], // Fallback siempre es simple text
      shouldSend: true,
      wasDetected: false,
      isFallback: true
    };
  }
}

// Singleton
export const messageProcessor = new MessageProcessor();
