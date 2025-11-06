/**
 * Message Processor - Procesador principal de mensajes
 * Orquesta todo el flujo: detección de intent, progreso, respuestas
 */

import { intentDetectionService } from '@/core/intent-engine';
import { fallbackHandler } from '@/core/fallback';
import { userRepository } from '@/data/repositories/user.repository';
import { conversationRepository } from '@/data/repositories/conversation.repository';
import { configRepository } from '@/data/repositories/config.repository';
import { appointmentManager } from '@/core/appointment/appointment-manager';
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

      // 3.5. Verificar si hay flujo de cita activo
      const hasAppointmentFlow = await appointmentManager.hasActiveFlow(user.id);
      if (hasAppointmentFlow) {
        // Usuario está en medio del flujo de cita, procesar su respuesta
        const flowResult = await appointmentManager.processFlowStep(user.id, messageText);
        
        // Guardar mensaje de respuesta
        await conversationRepository.saveOutgoingMessage(
          user.id,
          flowResult.message,
          false
        );

        return {
          responses: [flowResult.message],
          shouldSend: true,
          wasDetected: true,
          isFallback: false
        };
      }

      // 3.6. Verificar si está esperando confirmación de oferta automática
      const flowState = await userRepository.getAppointmentFlowState(user.id);
      if (flowState === 'pending_auto_offer') {
        const normalized = messageText.toLowerCase().trim();
        
        // Palabras afirmativas específicas que no interfieren con otros intents
        const positiveResponses = [
          'si', 'sí', 'claro', 'ok', 'vale', 'dale', 'yes',
          'por favor', 'porfavor', 'esta bien', 'está bien',
          'adelante', 'vamos', 'perfecto', 'excelente',
          'me interesa', 'quiero', 'acepto'
        ];
        
        const isPositive = positiveResponses.some(phrase => {
          // Buscar coincidencia exacta o como palabra completa
          const regex = new RegExp(`\\b${phrase}\\b`, 'i');
          return regex.test(normalized) || normalized === phrase;
        });

        if (isPositive) {
          // Usuario acepta, iniciar flujo de cita
          await userRepository.updateAppointmentFlowState(user.id, 'ask_date');
          
          const message = '¡Perfecto! 📅 ¿Qué día prefieres visitarnos?\n\n' +
                         'Puedes escribir:\n' +
                         '• "Hoy"\n' +
                         '• "Mañana"\n' +
                         '• Un día de la semana: "Lunes", "Martes"\n' +
                         '• Una fecha: "25 de octubre"';
          
          await conversationRepository.saveOutgoingMessage(user.id, message, false);
          
          return {
            responses: [message],
            shouldSend: true,
            wasDetected: true,
            isFallback: false
          };
        } else {
          // Usuario no acepta o pregunta otra cosa, limpiar estado y continuar normal
          await userRepository.clearAppointmentFlow(user.id);
          // Continuar con detección normal de intent (no hacer return)
        }
      }

      // 3.8. Verificar si está esperando nombre para derivación a asesor
      const session = await userRepository.getSession(user.id);
      
      if (session?.awaiting_advisor_name) {
        return await fallbackHandler.captureAdvisorName(user.id, user, messageText, session);
      }

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
        return await fallbackHandler.handle(user.id, messageText);
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
    // Si es intent "cita", iniciar flujo de agendamiento
    if (intentName === 'cita') {
      const flowResult = await appointmentManager.startFlow(userId);
      return [flowResult.message];
    }

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
        // Obtener puntos configurables desde BD
        const checkpointPoints = await configRepository.getInt('checkpoint_points', 15);
        const newScore = completedCount * checkpointPoints;
        await userRepository.updateLeadScore(userId, newScore);
      }
    }

    // Obtener respuesta configurada desde BD
    const responses = await conversationRepository.getBotResponses(intentName);
    
    if (responses.length === 0) {
      return ['Gracias por tu interés. ¿En qué más puedo ayudarte?'];
    }

    // Verificar si debe ofrecer cita (configurable desde BD)
    const completedCount = await userRepository.countCompletedCheckpoints(userId);
    const progress = await userRepository.getProgress(userId);
    
    // Obtener configuración dinámica
    const checkpointsRequired = await configRepository.getInt('checkpoints_for_appointment', 4);
    const autoOfferEnabled = await configRepository.getBoolean('appointment_auto_offer_enabled', true);

    if (autoOfferEnabled && completedCount >= checkpointsRequired && !progress?.appointment_offered) {
      // Marcar como ofrecido
      await userRepository.markAppointmentOffered(userId);
      
      // Guardar estado especial: esperando confirmación de oferta automática
      await userRepository.updateAppointmentFlowState(userId, 'pending_auto_offer');
      
      // Agregar mensaje de cita al final
      const appointmentOffer = '📅 Veo que ya tienes buena información del proyecto. ¿Te gustaría agendar una visita para conocerlo personalmente?';
      return [...responses, appointmentOffer];
    }

    return responses;
  }
}

// Singleton
export const messageProcessor = new MessageProcessor();
