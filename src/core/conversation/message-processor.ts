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
import { shouldOfferAppointment } from '@/core/appointment/appointment-offer-policy';
import { supabaseServer } from '@/services/supabase/server-client';
import { whatsappSender } from '@/services/whatsapp/message-sender';
import type { BotResponse } from '@/types/message-fragments.types';
import { isSimpleResponseWithMedia } from '@/types/message-fragments.types';
import type { IntentMatch } from '@/types/intent.types';
import { ROOT_SCOPE_ID, scopeRepository } from '@/data/repositories/scope.repository';
import {
  scopeRoutingService,
  SCOPE_FOCUS_WINDOW_MS,
  type ScopeFocusSource,
} from './scope-routing.service';
import type { User, UserSession } from '@/data/models/user.model';
import { scopeRoutingRepository } from '@/data/repositories/scope-routing.repository';
import { interpolateMessage } from '@/lib/interpolate-message';
import { resolveConfiguredMessage } from '@/core/messaging/configured-message';

// Fuentes de foco que pueden reanudar una pregunta retenida: las tres nacen de
// algo que el lead acaba de decir o traer. El foco heredado de la sesión no
// cuenta, porque entonces la pregunta se reanudaría en cada mensaje siguiente.
const RESUMING_FOCUS_SOURCES: ScopeFocusSource[] = ['alias', 'referral', 'override'];

function isPendingQuestionFresh(session: UserSession | null): boolean {
  if (!session?.pending_scope_message || !session.pending_scope_updated_at) return false;
  const askedAt = new Date(session.pending_scope_updated_at).getTime();
  return Number.isFinite(askedAt) && Date.now() - askedAt < SCOPE_FOCUS_WINDOW_MS;
}

export interface ProcessMessageOptions {
  scopeId?: string;
  referralAdId?: string;
}

export interface ProcessedResponse {
  responses: BotResponse[]; // Cambiado de 'message: string' a 'responses: BotResponse[]'
  shouldSend: boolean;
  wasDetected: boolean;
  isFallback: boolean;
  flowHandled?: boolean; // Indica si ya se manejó un flow state (evita doble verificación en webhook)
  detectedIntent?: IntentMatch;
  scopeId?: string;
}

export class MessageProcessor {
  /**
   * Procesar mensaje entrante
   */
  async processMessage(
    phoneNumber: string,
    messageText: string,
    messageId: string,
    userName?: string,
    options: ProcessMessageOptions = {}
  ): Promise<ProcessedResponse> {
    try {
      // 0. Enviar indicador de "escribiendo..." si está habilitado
      const typingEnabled = await configRepository.getBoolean('typing_indicator_enabled', true);
      if (typingEnabled) {
        // No await - ejecutar en paralelo para no bloquear
        whatsappSender.sendTypingIndicator(phoneNumber, messageId).catch(() => {});
      }

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

      const sessionBeforeRouting = await userRepository.getSession(user.id);
      const routing = await scopeRoutingService.resolve({
        userId: user.id,
        message: messageText,
        referralAdId: options.referralAdId,
        scopeOverride: options.scopeId,
      });
      const scopeId = routing.scopeId;

      // Pregunta retenida por una desambiguación anterior. Solo cuenta si el
      // foco quedó establecido por algo que el lead acaba de decir o traer, y
      // si sigue dentro de la ventana: reanudarla más tarde sería contestar
      // algo que el lead ya no está preguntando.
      const pendingQuestion =
        routing.hasFocus &&
        RESUMING_FOCUS_SOURCES.includes(routing.source) &&
        isPendingQuestionFresh(sessionBeforeRouting)
          ? sessionBeforeRouting!.pending_scope_message!
          : null;

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
          
          // El mensaje se guarda en el webhook después de enviarlo
          
          // Retornar mensaje de cancelación inmediatamente
          return {
            responses: [cancelMessage],
            shouldSend: true,
            wasDetected: true,
            isFallback: false,
            flowHandled: true,
            scopeId,
          };
        } else {
          // Usuario está respondiendo al flujo, procesar su respuesta
          const flowResult = await appointmentManager.processFlowStep(user.id, messageText, scopeId);
          
          // Guardar mensaje entrante del usuario
          await conversationRepository.saveIncomingMessage(
            user.id,
            messageId,
            messageText,
            {
              intent_id: 'appointment_flow',
              scope_id: scopeId,
              intent_name: 'appointment_flow',
              confidence: 1.0,
              matched_keywords: ['appointment', 'flow'],
              fuzzy_matches: [],
              detection_method: 'exact'
            },
            { scopeId, referralAdId: options.referralAdId }
          );
          
          // Si el mensaje está vacío (confirm_date, ask_time), no lo enviamos aquí
          // El webhook lo enviará con botones
          const responses: string[] = flowResult.message ? [flowResult.message] : [];
          
          // El mensaje se guarda en el webhook después de enviarlo
          // flowHandled = true SOLO si hay mensaje, para que el webhook pueda enviar botones
          const hasMessage = responses.length > 0;

          return {
            responses,
            shouldSend: true,
            wasDetected: true,
            isFallback: false,
            flowHandled: hasMessage,
            scopeId,
          };
        }
      }

      // 3.6. Verificar si está esperando confirmación de oferta automática
      const flowState = await userRepository.getAppointmentFlowState(user.id);
      if (flowState === 'pending_auto_offer') {
        const flowData = await userRepository.getAppointmentFlowData(user.id);
        const offerScopeId = flowData?.offer_scope_id
          || await scopeRepository.getBranchId(scopeId)
          || scopeId;
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
            await userRepository.markAppointmentOfferResponded(user.id, offerScopeId);
            
            // Actualizar score por responder al auto-offer
            await leadScorer.afterAutoOfferResponse(user.id, offerScopeId);
            
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
            
            // El mensaje se guarda en el webhook después de enviarlo
            
            return {
              responses: [message],
              shouldSend: true,
              wasDetected: true,
              isFallback: false,
              flowHandled: true,
              scopeId,
            };
          } else {
            // Usuario no acepta o pregunta otra cosa
            await userRepository.markAppointmentOfferRejected(user.id);
            await userRepository.clearAppointmentFlow(user.id);
            
            // Obtener mensaje de rechazo desde configuración
            const noResponse = await configRepository.get(
              'auto_offer_no_response',
              'Entendido, cuando estés listo para agendar una cita puedes pedirme: "Agendar una cita".\n\n¿Hay algo más en lo que pueda ayudarte?'
            );
            
            // El mensaje se guarda en el webhook después de enviarlo
            
            return {
              responses: [noResponse],
              shouldSend: true,
              wasDetected: true,
              isFallback: false,
              flowHandled: true,
              scopeId,
            };
          }
        }
      }

      // 3.8. Verificar si está esperando nombre para derivación a asesor
      const session = await userRepository.getSession(user.id);
      
      if (session?.awaiting_advisor_name) {
        return {
          ...await fallbackHandler.captureAdvisorName(user.id, user, messageText, session, scopeId),
          scopeId,
        };
      }

      // 4. Detectar intención con fuzzy matching
      //
      // Sin foco se busca en todos los alcances alcanzables, no solo en las
      // ramas de primer nivel: una intención definida únicamente en un
      // sub-alcance existe y tiene que poder detectarse. Cuál de ellos responde
      // es otra decisión, y de esa se ocupa la desambiguación, que sí razona
      // por rama.
      const availableScopes = routing.hasFocus
        ? []
        : await scopeRoutingRepository.getAvailableScopes();
      const detectableScopeIds = routing.hasFocus || availableScopes.length <= 1
        ? []
        : Array.from(await scopeRepository.getReachableScopeIds());
      const detectIn = (text: string) => (
        detectableScopeIds.length === 0
          ? intentDetectionService.detect(text, supabaseServer, scopeId)
          : intentDetectionService.detectAcrossScopes(text, supabaseServer, detectableScopeIds)
      );

      let detectionResult = await detectIn(messageText);
      let messageForDetection = messageText;

      // El mensaje que establece el foco suele ser solo el nombre del
      // desarrollo, y por sí mismo no pregunta nada: ese es el momento de
      // recuperar la pregunta retenida. Si el lead aprovechó para preguntar
      // otra cosa —"¿dónde queda Beta?"—, esa es su pregunta; contestarle en su
      // lugar la de ayer descarta en silencio lo que acaba de escribir.
      if (pendingQuestion && !detectionResult.detected) {
        detectionResult = await detectIn(pendingQuestion);
        messageForDetection = pendingQuestion;
      }
      if (pendingQuestion) {
        await userRepository.clearPendingScopeQuestion(user.id);
      }

      // 5. Guardar mensaje entrante
      const conversation = await conversationRepository.saveIncomingMessage(
        user.id,
        messageId,
        messageText,
        detectionResult.intent,
        { scopeId, referralAdId: options.referralAdId }
      );

      if (
        !routing.hasFocus &&
        detectionResult.intent &&
        await scopeRoutingRepository.isIntentScopeDependent(detectionResult.intent.intent_name)
      ) {
        await userRepository.setPendingScopeQuestion(
          user.id,
          messageText,
          detectionResult.intent.intent_name
        );
        const scopeList = await this.getAvailableScopeList();
        const message = await resolveConfiguredMessage(
          'scope_disambiguation_message',
          '¿De cuál {project_singular} te gustaría recibir información?\n\n{alcances}',
          { alcances: scopeList }
        );
        return {
          responses: [message],
          shouldSend: true,
          wasDetected: true,
          isFallback: false,
          detectedIntent: detectionResult.intent,
          scopeId,
        };
      }

      // 6. Si no se detectó intención → Fallback
      if (!detectionResult.detected || !detectionResult.intent) {
        return {
          ...await fallbackHandler.handle(user.id, messageText),
          scopeId,
        };
      }

      // 7. Guardar log de intención
      await conversationRepository.saveIntentLog(
        user.id,
        conversation.id,
        detectionResult.intent,
        messageForDetection,
        detectionResult.normalized_message
      );

      // 8. Resetear contador de fallback (tuvo éxito)
      await userRepository.resetFallbackAttempts(user.id);

      // 9. Procesar intención específica
      const responses = await this.handleIntent(
        user,
        detectionResult.intent,
        scopeId,
        routing.hasFocus
      );

      return {
        responses,
        shouldSend: true,
        wasDetected: true,
        isFallback: false,
        detectedIntent: detectionResult.intent,
        scopeId,
      };

    } catch (error) {
      console.error('Error processing message:', error);
      return {
        responses: ['Disculpa, tuve un problema técnico. ¿Podrías repetir tu pregunta?'],
        shouldSend: true,
        wasDetected: false,
        isFallback: true,
        scopeId: options.scopeId ?? ROOT_SCOPE_ID,
      };
    }
  }

  /**
   * Manejar intención detectada
   * Retorna array de BotResponse (pueden ser strings simples o fragmentados)
   */
  private async handleIntent(
    user: User,
    intent: IntentMatch,
    scopeId?: string | null,
    hasFocus: boolean = true
  ): Promise<BotResponse[]> {
    const userId = user.id;
    const resolvedScopeId = scopeId ?? ROOT_SCOPE_ID;

    // Si es intent "cita", iniciar flujo de agendamiento
    // skipConfirmation = true porque el usuario ya dijo explícitamente que quiere agendar
    if (intent.intent_name === 'cita') {
      await leadScorer.afterScopeInteraction(userId, resolvedScopeId);
      const flowResult = await appointmentManager.startFlow(userId, true, resolvedScopeId);
      return [flowResult.message];
    }

    // Verificar si es checkpoint (determinado por is_checkpoint de intent_configurations)
    if (intent.is_checkpoint) {
      // Verificar si ya completó este tema
      const isCompleted = await userRepository.isCheckpointCompleted(
        userId,
        resolvedScopeId,
        intent.intent_name
      );
      
      // Marcar como completado (solo si no lo estaba antes)
      if (!isCompleted) {
        await userRepository.markCheckpointCompleted(userId, resolvedScopeId, intent.intent_name);
        
        // Recalcular lead score automáticamente
        await leadScorer.afterCheckpointCompleted(userId, resolvedScopeId);
      }
    } else if (!await userRepository.getScopeProgress(userId, resolvedScopeId)) {
      // Una interacción sin checkpoint también inicia el detalle del alcance.
      // De otro modo el dashboard no podría distinguir "preguntó, score 0" de
      // "nunca mostró interés en esta rama".
      //
      // Solo en el primer contacto. Recalcular en cada mensaje reescribía una
      // cifra que no había cambiado, a costa de una decena de consultas por
      // mensaje en un webhook que ya bloquea mientras envía.
      await leadScorer.afterScopeInteraction(userId, resolvedScopeId);
    }

    // Obtener respuesta configurada desde BD
    const scopeList = await this.getAvailableScopeList();
    const responses = await conversationRepository.getBotResponses(
      intent.response_intent_ids || intent.intent_id,
      { alcances: scopeList, nombre: user.name ?? '', telefono: user.phone_number }
    );
    
    // Verificar si debe ofrecer cita (configurable desde BD)
    const offerScopeId = await scopeRepository.getBranchId(resolvedScopeId) ?? resolvedScopeId;
    const completedCount = await userRepository.countCompletedCheckpoints(userId, offerScopeId);
    const appointmentOffered = await userRepository.hasAppointmentBeenOffered(userId, offerScopeId);
    
    // Obtener configuración dinámica
    const checkpointsRequired = await configRepository.getInt('checkpoints_for_appointment', 4);
    const autoOfferEnabled = await configRepository.getBoolean('appointment_auto_offer_enabled', true);
    const cooldownHours = await configRepository.getInt('appointment_offer_cooldown_hours', 168);
    const isCoolingDown = await userRepository.isAppointmentOfferCoolingDown(userId, cooldownHours);
    const shouldOffer = shouldOfferAppointment({
      autoOfferEnabled,
      completedCheckpoints: completedCount,
      requiredCheckpoints: checkpointsRequired,
      isStrongSignal: intent.is_strong_signal === true,
      alreadyOfferedInScope: appointmentOffered,
      isCoolingDown,
    });

    if (shouldOffer) {
      // Marcar como ofrecido y establecer estado ANTES de enviar mensaje
      await userRepository.markAppointmentOffered(userId, offerScopeId);
      await userRepository.updateAppointmentFlowData(userId, {
        scope_id: resolvedScopeId,
        offer_scope_id: offerScopeId,
      });
      await userRepository.updateAppointmentFlowState(userId, 'pending_auto_offer');
      
      // NO enviar el auto-offer aquí, se enviará después en el webhook
      // para asegurar que el estado ya está guardado en BD
    }

    if (responses.length === 0) {
      return ['Gracias por tu interés. ¿En qué más puedo ayudarte?'];
    }

    if (intent.intent_name === 'saludo' && !hasFocus) {
      const scopes = await scopeRoutingRepository.getAvailableScopes();
      if (scopes.length > 1) {
        responses.push(await resolveConfiguredMessage(
          'scope_presentation_message',
          '{project_plural_title} disponibles:\n\n{alcances}\n\n¿Cuál te interesa?',
          { alcances: scopeList }
        ));
      }
    }

    return responses;
  }

  private async getAvailableScopeList(): Promise<string> {
    const scopes = await scopeRoutingRepository.getAvailableScopes();
    return scopes.map(scope => `- ${scope.name}`).join('\n');
  }
}

// Singleton
export const messageProcessor = new MessageProcessor();
