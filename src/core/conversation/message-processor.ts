/**
 * Message Processor - Procesador principal de mensajes
 * Orquesta todo el flujo: detección de intent, progreso, respuestas
 */

import { intentDetectionService } from '@/core/intent-engine';
import { fallbackHandler } from '@/core/fallback';
import { leadScorer } from '@/core/scoring';
import { userRepository } from '@/data/repositories/user.repository';
import { conversationRepository } from '@/data/repositories/conversation.repository';
import { configRepository } from '@/data/repositories/config.repository';
import { appointmentManager } from '@/core/appointment/appointment-manager';
import { supabaseServer } from '@/services/supabase/server-client';
import type { CheckpointKey } from '@/data/models/user.model';
import type { BotResponse } from '@/types/message-fragments.types';
import { isSimpleResponseWithMedia } from '@/types/message-fragments.types';

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
        // Detectar si el usuario quiere cancelar o cambiar de tema
        const normalized = messageText.toLowerCase().trim();
        const cancelPhrases = [
          'cancelar', 'no quiero', 'después', 'luego', 'más tarde',
          'información', 'informacion', 'otra cosa', 'pregunta',
          'precio', 'ubicacion', 'modelo', 'credito', 'seguridad',
          'cuanto', 'donde', 'como', 'que'
        ];
        
        const wantsToCancel = cancelPhrases.some(phrase => normalized.includes(phrase));
        
        if (wantsToCancel) {
          // Usuario quiere hacer otra cosa, cancelar el flujo
          await userRepository.clearAppointmentFlow(user.id);
          
          const cancelMessage = await configRepository.get(
            'appointment_flow_cancelled',
            'Entendido, cancelé el proceso de agendamiento.\n\nSi vuelves a estar interesado en una cita, puedes pedirme: "Agendar una cita".\n\n¿En qué más puedo ayudarte?'
          );
          
          await conversationRepository.saveOutgoingMessage(user.id, cancelMessage, false);
          
          // Retornar mensaje de cancelación inmediatamente
          return {
            responses: [cancelMessage],
            shouldSend: true,
            wasDetected: true,
            isFallback: false
          };
        } else {
          // Usuario está respondiendo al flujo, procesar su respuesta
          const flowResult = await appointmentManager.processFlowStep(user.id, messageText);
          
          // Guardar mensaje entrante del usuario
          await conversationRepository.saveIncomingMessage(
            user.id,
            messageId,
            messageText,
            {
              intent_name: 'appointment_flow',
              confidence: 1.0,
              matched_keywords: ['appointment', 'flow'],
              fuzzy_matches: [],
              detection_method: 'exact'
            }
          );
          
          // Si el mensaje está vacío (ask_time), no lo enviamos aquí
          // El webhook lo enviará con botones (patrón similar a auto-offer)
          const responses: string[] = flowResult.message ? [flowResult.message] : [];
          
          // Solo guardar mensaje si no está vacío
          if (flowResult.message) {
            await conversationRepository.saveOutgoingMessage(
              user.id,
              flowResult.message,
              false
            );
          }

          return {
            responses,
            shouldSend: true,
            wasDetected: true,
            isFallback: false
          };
        }
      }

      // 3.6. Verificar si está esperando confirmación de oferta automática
      const flowState = await userRepository.getAppointmentFlowState(user.id);
      if (flowState === 'pending_auto_offer') {
        const normalized = messageText.toLowerCase().trim();
        
        // Detectar si es una pregunta nueva en lugar de respuesta a la oferta
        const isNewQuestion = normalized.includes('?') || 
                             normalized.includes('información') ||
                             normalized.includes('informacion') ||
                             normalized.includes('que') ||
                             normalized.includes('qué') ||
                             normalized.includes('cuanto') ||
                             normalized.includes('cuánto') ||
                             normalized.includes('donde') ||
                             normalized.includes('dónde') ||
                             normalized.includes('como') ||
                             normalized.includes('cómo') ||
                             normalized.includes('más') ||
                             normalized.includes('mas');
        
        if (isNewQuestion && normalized.length > 10) {
          // Es una pregunta nueva, cancelar oferta pendiente
          await userRepository.clearAppointmentFlow(user.id);
          // Continuar con el flujo normal sin retornar
        } else {
          // Es una respuesta a la oferta
          // Detectar si es respuesta de botón o texto
          let isPositive: boolean;
          
          if (normalized === 'appointment_yes') {
            // Botón "Sí, me interesa"
            isPositive = true;
          } else if (normalized === 'appointment_no') {
            // Botón "No, gracias"
            isPositive = false;
          } else {
            // Si no es botón, verificar palabras afirmativas
            isPositive = ['si', 'sí', 'claro', 'ok', 'vale', 'dale', 'yes',
                         'por favor', 'porfavor', 'esta bien', 'está bien',
                         'adelante', 'vamos', 'perfecto', 'excelente',
                         'me interesa', 'quiero', 'acepto'].some(phrase => {
                          const regex = new RegExp(`\\b${phrase}\\b`, 'i');
                          return regex.test(normalized) || normalized === phrase;
                        });
          }

          if (isPositive) {
            // Usuario acepta, iniciar flujo de cita
            await userRepository.updateAppointmentFlowState(user.id, 'ask_date');
            
            // Actualizar score por responder al auto-offer
            await leadScorer.afterAutoOfferResponse(user.id);
            
            // Obtener mensajes desde configuración
            const yesResponse = await configRepository.get(
              'auto_offer_yes_response',
              '¡Perfecto! Vamos a agendar tu visita. 📅'
            );
            const requestDate = await configRepository.get(
              'appointment_request_date',
              '¿Qué día te gustaría visitarnos? Por favor indica una fecha (ejemplo: mañana, viernes, 15 de noviembre)'
            );
            
            const message = `${yesResponse}\n\n${requestDate}`;
            
            await conversationRepository.saveOutgoingMessage(user.id, message, false);
            
            return {
              responses: [message],
              shouldSend: true,
              wasDetected: true,
              isFallback: false
            };
          } else {
            // Usuario no acepta o pregunta otra cosa
            await userRepository.clearAppointmentFlow(user.id);
            
            // Obtener mensaje de rechazo desde configuración
            const noResponse = await configRepository.get(
              'auto_offer_no_response',
              'Entendido, cuando estés listo para agendar una cita puedes pedirme: "Agendar una cita".\n\n¿Hay algo más en lo que pueda ayudarte?'
            );
            
            await conversationRepository.saveOutgoingMessage(user.id, noResponse, false);
            
            return {
              responses: [noResponse],
              shouldSend: true,
              wasDetected: true,
              isFallback: false
            };
          }
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
        
        // Recalcular lead score automáticamente
        await leadScorer.afterCheckpointCompleted(userId);
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
      // Marcar como ofrecido y establecer estado ANTES de enviar mensaje
      await userRepository.markAppointmentOffered(userId);
      await userRepository.updateAppointmentFlowState(userId, 'pending_auto_offer');
      
      // NO enviar el auto-offer aquí, se enviará después en el webhook
      // para asegurar que el estado ya está guardado en BD
    }

    return responses;
  }
}

// Singleton
export const messageProcessor = new MessageProcessor();
