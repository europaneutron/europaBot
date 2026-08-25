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
  type ScopeRoutingResult,
} from './scope-routing.service';
import type { User, UserSession, PendingOfferOption } from '@/data/models/user.model';
import { scopeRoutingRepository } from '@/data/repositories/scope-routing.repository';
import { interpolateMessage } from '@/lib/interpolate-message';
import { resolveConfiguredMessage } from '@/core/messaging/configured-message';
import { withContentVersionScope } from '@/lib/server/content-version-scope';
import { isAffirmative, isPureAffirmative } from './affirmative-phrases';
import { isSiblingRequest } from './sibling-request';
import {
  buildScopeOptions,
  MAX_LIST_OPTIONS,
} from './scope-enumeration.service';
import {
  isPendingOfferFresh,
  resolvePendingOfferSelection,
  authoredButtonsToOfferOptions,
} from './pending-offer-messages';

// Fuentes de foco que pueden reanudar una pregunta retenida: las tres nacen de
// algo que el lead acaba de decir o traer. El foco heredado de la sesión no
// cuenta, porque entonces la pregunta se reanudaría en cada mensaje siguiente.
const RESUMING_FOCUS_SOURCES: ScopeFocusSource[] = ['alias', 'referral', 'override'];

// Intenciones que no son una pregunta que repetir. Mencionar un alcance a
// secas repite la última pregunta contestada, y estas cuatro no lo son:
//
//   `cita` y `asesor` arrancan un flujo. Un lead que agendaba, cancelaba y
//   decía "Altabrisa" recibía otra vez "¿qué día te gustaría visitarnos?".
//
//   `saludo` y `despedida` abren y cierran la conversación. Peor todavía:
//   saludar suelta el foco, así que repetir el saludo al mencionar un alcance
//   tiraba el foco que esa misma mención acababa de fijar. Medido tras un
//   recorrido real del compilador: "hola" y luego "me interesa Europa"
//   devolvía el saludo entero en vez del precio de Europa.
const NON_REPEATABLE_INTENT_NAMES = new Set(['cita', 'asesor', 'saludo', 'despedida']);

/**
 * El nombre no es una convencion mas: es el disparador del flujo de
 * agendamiento (ver el caso especial en `handleIntent`). Vive aparte para no
 * repetir el literal en cada sitio que lo compara.
 */
const CITA_INTENT_NAME = 'cita';

/**
 * Igual que `CITA_INTENT_NAME`, pero para el botón sintético "Hablar con un
 * asesor": dispara la derivación directo (ver el caso especial en
 * `handleIntent`), sin depender de que el lead agote sus 3 intentos de
 * fallback primero.
 */
const DERIVATION_INTENT_NAME = 'asesor';

function isPendingQuestionFresh(session: UserSession | null): boolean {
  if (!session?.pending_scope_message || !session.pending_scope_updated_at) return false;
  const askedAt = new Date(session.pending_scope_updated_at).getTime();
  return Number.isFinite(askedAt) && Date.now() - askedAt < SCOPE_FOCUS_WINDOW_MS;
}

export interface ProcessMessageOptions {
  scopeId?: string;
  referralAdId?: string;
  suppressExternalMessages?: boolean;
  // Datos ya estructurados de un WhatsApp Flow completado (nfm_reply). Cuando
  // llega esto, `messageText` es solo un placeholder para logs — el dato real
  // está aquí.
  flowResponse?: Record<string, any>;
}

export interface ProcessedResponse {
  responses: BotResponse[]; // Cambiado de 'message: string' a 'responses: BotResponse[]'
  shouldSend: boolean;
  wasDetected: boolean;
  isFallback: boolean;
  flowHandled?: boolean; // Indica si ya se manejó un flow state (evita doble verificación en webhook)
  detectedIntent?: IntentMatch;
  scopeId?: string;
  error?: string;
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
    // La version del arbol se fija aqui y vale para todo el mensaje.
    return withContentVersionScope(() =>
      this.processMessageInScope(phoneNumber, messageText, messageId, userName, options)
    );
  }

  private async processMessageInScope(
    phoneNumber: string,
    messageText: string,
    messageId: string,
    userName?: string,
    options: ProcessMessageOptions = {}
  ): Promise<ProcessedResponse> {
    try {
      // 0. Enviar indicador de "escribiendo..." si está habilitado
      const typingEnabled = await configRepository.getBoolean('typing_indicator_enabled', true);
      if (typingEnabled && !options.suppressExternalMessages) {
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

      // Una opción tocada o escrita contra la oferta viva fija el foco sin
      // pasar por el matcher difuso: misma prioridad que un alias explícito.
      const offerSelection = resolvePendingOfferSelection(sessionBeforeRouting, messageText);
      const priorOffer = isPendingOfferFresh(sessionBeforeRouting) ? sessionBeforeRouting : null;

      // La oferta se consume al resolverse y se descarta en cuanto el bot va
      // a contestar algo sin usarla. Lo que haga falta de ella ya quedó en
      // `priorOffer`/`offerSelection`; a partir de aquí, limpia. Solo se
      // escribe si había algo que limpiar: la mayoría de los mensajes llegan
      // sin oferta viva y no tienen por qué pagar una escritura.
      if (sessionBeforeRouting?.pending_offer_options?.length) {
        await userRepository.clearPendingOffer(user.id);
      }

      const routing = await scopeRoutingService.resolve({
        userId: user.id,
        message: messageText,
        referralAdId: options.referralAdId,
        scopeOverride: options.scopeId ?? offerSelection?.option.scopeId,
      });
      const scopeId = routing.scopeId;

      // "Agendar visita" es un boton que arranca el flujo de cita directo,
      // sin pasar por `intent_configurations`: a diferencia de cualquier otra
      // pregunta, no depende de que exista ni este activa ninguna fila --por
      // eso funciona igual si esa fila se archiva o se borra por accidente,
      // que es justo lo que le paso a esta antes de escribir esto--. El resto
      // de las opciones si necesita resolver contra una fila real, mas abajo.
      if (offerSelection?.option.intentName === CITA_INTENT_NAME) {
        await userRepository.setScopeFocus(user.id, offerSelection.option.scopeId, scopeId);
        const syntheticCita: IntentMatch = {
          intent_id: 'system:cita',
          scope_id: offerSelection.option.scopeId,
          intent_name: CITA_INTENT_NAME,
          confidence: 1,
          matched_keywords: [],
          fuzzy_matches: [],
          detection_method: 'exact',
        };
        const offeredResponses = await this.handleIntent(
          user,
          syntheticCita,
          offerSelection.option.scopeId,
          true
        );
        return {
          responses: offeredResponses,
          shouldSend: true,
          wasDetected: true,
          isFallback: false,
          detectedIntent: syntheticCita,
          scopeId: offerSelection.option.scopeId,
        };
      }

      // "Hablar con un asesor" es el mismo caso que "Agendar visita": un boton
      // que dispara un flujo propio directo, sin pasar por
      // `intent_configurations` ni por los 3 intentos de fallback que
      // normalmente lo desencadenan.
      if (offerSelection?.option.intentName === DERIVATION_INTENT_NAME) {
        await userRepository.setScopeFocus(user.id, offerSelection.option.scopeId, scopeId);
        const syntheticAsesor: IntentMatch = {
          intent_id: 'system:asesor',
          scope_id: offerSelection.option.scopeId,
          intent_name: DERIVATION_INTENT_NAME,
          confidence: 1,
          matched_keywords: [],
          fuzzy_matches: [],
          detection_method: 'exact',
        };
        const offeredResponses = await this.handleIntent(
          user,
          syntheticAsesor,
          offerSelection.option.scopeId,
          true
        );
        return {
          responses: offeredResponses,
          shouldSend: true,
          wasDetected: true,
          isFallback: false,
          detectedIntent: syntheticAsesor,
          scopeId: offerSelection.option.scopeId,
        };
      }

      // Un boton de oferta que apunta a una pregunta se contesta ahi mismo: el
      // identificador ya dice cual y en que alcance, asi que no hay nada que
      // detectar. Es lo que convierte "¿te muestro las amenidades?" en un toque
      // que el bot resuelve, en vez de un "si" que no coincide con nada.
      if (offerSelection?.option.intentName) {
        const offered = await intentDetectionService.resolveByName(
          offerSelection.option.intentName,
          supabaseServer,
          offerSelection.option.scopeId
        );
        if (offered) {
          await userRepository.setScopeFocus(user.id, offerSelection.option.scopeId, scopeId);
          const offeredResponses = await this.handleIntent(
            user,
            offered,
            offerSelection.option.scopeId,
            true
          );
          if (offeredResponses.length > 0) {
            return {
              responses: offeredResponses,
              shouldSend: true,
              wasDetected: true,
              isFallback: false,
              detectedIntent: offered,
              scopeId: offerSelection.option.scopeId,
            };
          }
        }
      }

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

      // 3.5.1. Un WhatsApp Flow completado llega como datos estructurados, no
      // como texto libre — se resuelve aparte, sin pasar por las
      // `cancelPhrases` de abajo (esas existen para interpretar intención en
      // texto ambiguo; aquí no hay nada que interpretar, ya viene validado
      // por la UI nativa del formulario).
      if (hasAppointmentFlow && options.flowResponse) {
        const flowResult = await appointmentManager.completeFromFlowSubmission(
          user.id,
          options.flowResponse,
          scopeId
        );

        await conversationRepository.saveIncomingMessage(
          user.id,
          messageId,
          messageText,
          {
            intent_id: 'appointment_flow',
            scope_id: scopeId,
            intent_name: 'appointment_flow',
            confidence: 1.0,
            matched_keywords: ['appointment', 'whatsapp_flow'],
            fuzzy_matches: [],
            detection_method: 'exact'
          },
          { scopeId, referralAdId: options.referralAdId }
        );

        return {
          responses: [flowResult.message],
          shouldSend: true,
          wasDetected: true,
          isFallback: false,
          flowHandled: true,
          scopeId,
        };
      }

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
            // Si no es botón, verificar palabras afirmativas. La lista vive
            // en un solo lugar: ver `affirmative-phrases.ts`.
            isPositive = isAffirmative(normalized);
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

      // 3.9. Un afirmativo se resuelve contra la oferta viva antes que contra
      // el matcher: sin oferta, "sí" sigue siendo palabra vacía y sigue de
      // largo hacia la detección normal.
      if (isPureAffirmative(messageText)) {
        if (priorOffer?.pending_offer_options?.length) {
          const resolved = await this.resolveAffirmativeOffer(user, priorOffer);
          return { scopeId, ...resolved };
        }
        // Sin oferta viva, un afirmativo no es palabra vacía hacia el
        // fallback genérico: no hay a qué decir que sí, así que se pregunta
        // y se ofrecen las opciones disponibles.
        return {
          ...await this.presentSiblings(user, routing, 'unanchored_affirmative'),
          scopeId,
        };
      }

      // 3.91. Pedir otro es pedir los hermanos del alcance en foco, no el
      // catálogo entero.
      if (isSiblingRequest(messageText)) {
        // El alcance sale de dentro: con un solo hermano, pedir otro cambia
        // el foco, y anteponer aqui el del ruteo lo tiraba en el camino.
        const presented = await this.presentSiblings(user, routing);
        return { scopeId, ...presented };
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

      // Mencionar un alcance a secas no pregunta nada nuevo: repite ahí la
      // última pregunta que sí se contestó en la conversación, aunque esa
      // respuesta no haya dejado pendiente ninguna desambiguación.
      const isFreshMention = RESUMING_FOCUS_SOURCES.includes(routing.source);
      if (
        !detectionResult.detected
        && isFreshMention
        && sessionBeforeRouting?.last_intent_detected
        && !NON_REPEATABLE_INTENT_NAMES.has(sessionBeforeRouting.last_intent_detected)
      ) {
        const replay = await intentDetectionService.resolveByName(
          sessionBeforeRouting.last_intent_detected,
          supabaseServer,
          scopeId
        );
        if (replay) {
          detectionResult = {
            detected: true,
            intent: replay,
            normalized_message: messageText,
            all_matches: [replay],
          };
          messageForDetection = messageText;
        }
      }

      // 5. Guardar mensaje entrante
      const conversation = await conversationRepository.saveIncomingMessage(
        user.id,
        messageId,
        messageText,
        detectionResult.intent,
        { scopeId, referralAdId: options.referralAdId }
      );

      // Saludar suelta el foco: es la salida del lead de una rama sin tener
      // que nombrar otra. Detectar el saludo no depende del foco, así que se
      // resuelve igual y solo cambia lo que pasa después.
      let effectiveScopeId = scopeId;
      let effectiveHasFocus = routing.hasFocus;
      if (detectionResult.intent?.intent_name === 'saludo' && routing.hasFocus) {
        await userRepository.clearScopeFocus(user.id);
        await userRepository.clearPendingScopeQuestion(user.id);
        await userRepository.clearPendingOffer(user.id);
        effectiveScopeId = ROOT_SCOPE_ID;
        effectiveHasFocus = false;
      }

      // El cálculo parte del foco cuando lo hay, no solo de la raíz: con
      // foco puesto en un desarrollo cuyos modelos difieren, la duda sigue
      // estando ahí abajo, y es donde hay que afirmar el rango y preguntar.
      const dependency = detectionResult.intent
        ? await scopeRoutingRepository.findScopeDependency(detectionResult.intent.intent_name, effectiveScopeId)
        : null;
      if (dependency && detectionResult.intent) {
        const plan = await this.buildDisambiguationPlan(detectionResult.intent.intent_name, dependency);
        if (plan) {
          await userRepository.setPendingScopeQuestion(
            user.id,
            messageForDetection,
            detectionResult.intent.intent_name
          );
          await userRepository.setPendingOffer(
            user.id,
            detectionResult.intent.intent_name,
            dependency.level,
            plan.options
          );
          return {
            responses: [plan.bodyText],
            shouldSend: true,
            wasDetected: true,
            isFallback: false,
            detectedIntent: detectionResult.intent,
            scopeId: effectiveScopeId,
          };
        }
        // Más de diez opciones y sin criterio del catálogo para estrechar:
        // mejor decirlo y pasar al asesor que mandar una lista que el
        // transporte va a rechazar.
        return {
          ...await fallbackHandler.handle(user.id, messageText, effectiveScopeId),
          scopeId: effectiveScopeId,
        };
      }

      // 6. Si no se detectó intención...
      if (!detectionResult.detected || !detectionResult.intent) {
        // ...salvo que sea una mención a secas sin nada que repetir: ahí se
        // presenta el alcance y se ofrece su nivel siguiente, en vez de caer
        // al fallback genérico.
        if (isFreshMention && effectiveHasFocus) {
          return {
            ...await this.presentFocusedScope(user, effectiveScopeId),
            scopeId: effectiveScopeId,
          };
        }
        return {
          ...await fallbackHandler.handle(user.id, messageText, effectiveScopeId),
          scopeId: effectiveScopeId,
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

      // La última pregunta contestada con éxito: lo que repite mencionar un
      // alcance a secas si el lead cambia de foco sin preguntar de nuevo.
      await userRepository.updateSession(user.id, {
        last_intent_detected: detectionResult.intent.intent_name,
      });

      // 9. Procesar intención específica
      const responses = await this.handleIntent(
        user,
        detectionResult.intent,
        effectiveScopeId,
        effectiveHasFocus
      );

      // Detectada pero sin nada que mandar. Se cae al fallback igual, pero
      // diciendo cual era: el panel decia "Intencion: No detectada" y era
      // mentira --el matcher habia acertado y la respuesta se habia caido
      // despues--, asi que quien configuraba iba a buscar el problema al
      // vocabulario, que es el unico sitio donde no estaba.
      //
      // Y se retira la oferta: `handleIntent` la deja puesta antes de saber si
      // tiene algo que mandar, asi que un turno que acababa en "no entiendo tu
      // pregunta" salia con los botones de la respuesta que nunca salio.
      if (responses.length === 0) {
        console.error(
          `La intencion "${detectionResult.intent.intent_name}" se detecto pero no dejo nada que`
          + ` mandar en el alcance ${effectiveScopeId}.`
        );
        await userRepository.clearPendingOffer(user.id);
        return {
          ...await fallbackHandler.handle(user.id, messageText, effectiveScopeId),
          detectedIntent: detectionResult.intent,
          scopeId: effectiveScopeId,
        };
      }

      return {
        responses,
        shouldSend: true,
        wasDetected: true,
        isFallback: false,
        detectedIntent: detectionResult.intent,
        scopeId: effectiveScopeId,
      };

    } catch (error) {
      console.error('Error processing message:', error);
      return {
        responses: ['Disculpa, tuve un problema técnico. ¿Podrías repetir tu pregunta?'],
        shouldSend: true,
        wasDetected: false,
        isFallback: true,
        scopeId: options.scopeId ?? ROOT_SCOPE_ID,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  /**
   * La pregunta de desambiguación: un mensaje y las opciones debajo. `null`
   * cuando hay más opciones de las que WhatsApp permite enumerar.
   *
   * Un solo mensaje, y escrito a mano. Antes eran tres --un adelanto
   * compuesto con los datos del catálogo, la respuesta del nivel si la había,
   * y una coletilla distinta según cuál de los dos hubiera salido--, así que
   * el mismo momento sonaba de tres maneras y ninguna se podía ver entera
   * antes de mandarla. El adelanto además repetía en prosa exactamente lo que
   * iba en los botones de abajo.
   *
   * Y ya no hace falta cubrir el hueco de "el nivel tiene algo que decir":
   * si lo tiene, `findScopeDependency` no llega hasta aquí.
   */
  private async buildDisambiguationPlan(
    intentName: string,
    dependency: { level: string; candidateIds: string[] }
  ): Promise<{ bodyText: string; options: PendingOfferOption[] } | null> {
    if (dependency.candidateIds.length > MAX_LIST_OPTIONS) return null;

    const options = await buildScopeOptions(dependency.candidateIds, intentName);
    if (options.length === 0) return null;

    const bodyText = await resolveConfiguredMessage(
      'scope_disambiguation_message',
      '¿De cuál te gustaría recibir información?',
      // La descripcion de este mensaje ya prometia {alcances} y el codigo
      // no se lo pasaba: quien lo escribia siguiendo la ayuda veia
      // "{alcances}" en el mensaje del lead.
      { alcances: await this.getAvailableScopeList() }
    );

    return { bodyText, options };
  }

  /**
   * Un afirmativo contra la oferta viva. Una sola opción es una oferta de
   * sí/no: se ejecuta directo. Varias opciones no se eligen con un "sí": se
   * repiten.
   */
  private async resolveAffirmativeOffer(
    user: User,
    offer: UserSession
  ): Promise<ProcessedResponse> {
    const options = offer.pending_offer_options!;

    if (options.length > 1) {
      await userRepository.setPendingOffer(
        user.id,
        offer.pending_offer_intent_name || '',
        offer.pending_offer_level || null,
        options
      );
      // Texto fijo: es repetir la pregunta que acaba de salir, y el mensaje
      // que la lleva ya lo escribió el cliente.
      return {
        responses: ['¿Cuál de estas te muestro?'],
        shouldSend: true,
        wasDetected: true,
        isFallback: false,
        scopeId: offer.current_scope_id ?? undefined,
      };
    }

    const option = options[0];
    const intentName = offer.pending_offer_intent_name;
    const replay = intentName
      ? await intentDetectionService.resolveByName(intentName, supabaseServer, option.scopeId)
      : null;

    if (!replay) {
      // Oferta de nivel siguiente sin intención propia (mención a secas o
      // "pedir otro"): el "sí" simplemente fija el foco en la única opción.
      await userRepository.setScopeFocus(user.id, option.scopeId, offer.current_scope_id ?? null);
      return { ...await this.presentFocusedScope(user, option.scopeId), scopeId: option.scopeId };
    }

    await userRepository.setScopeFocus(user.id, option.scopeId, offer.current_scope_id ?? null);
    const responses = await this.handleIntent(user, replay, option.scopeId, true);

    // Sin respuesta detras, el toque devolvia una lista vacia y el bot no
    // mandaba nada: el lead tocaba lo que se le ofrecio y no pasaba nada. Un
    // mensaje escrito ya caia al fallback en ese caso; el toque no tenia red,
    // y es donde mas se nota, porque ahi el lead sabe que hizo lo correcto.
    if (responses.length === 0) {
      return {
        ...await fallbackHandler.handle(user.id, replay.intent_name, option.scopeId),
        scopeId: option.scopeId,
      };
    }

    return {
      responses,
      shouldSend: true,
      wasDetected: true,
      isFallback: false,
      detectedIntent: replay,
      scopeId: option.scopeId,
    };
  }

  /**
   * Pedir otro es pedir los hermanos del alcance en foco. Sin hermanos, se
   * ofrece lo que sí hay; sin foco, el primer nivel.
   *
   * Con un solo hermano no se pregunta: se cambia el foco y se presenta. Un
   * botón no es una elección. Con dos desarrollos, "¿y el otro?" desde uno de
   * ellos siempre dejaba exactamente una opción, así que el bot enseñaba un
   * botón con la única respuesta posible y esperaba a que lo tocaran para
   * hacer justo lo que ya iba a hacer.
   *
   * Con dos o más, esto es desambiguación con otro disparador: mismo mensaje,
   * el que se escribe en Ajustes.
   */
  private async presentSiblings(
    user: User,
    routing: ScopeRoutingResult,
    reason: 'siblings' | 'unanchored_affirmative' = 'siblings'
  ): Promise<ProcessedResponse> {
    let siblings = routing.hasFocus
      ? await scopeRoutingRepository.getSiblingScopes(routing.scopeId)
      : [];

    if (siblings.length === 0) {
      siblings = (await scopeRoutingRepository.getAvailableScopes())
        .filter(scope => scope.id !== routing.scopeId);
    }

    if (siblings.length === 0) {
      // Texto fijo: solo se llega aquí sin ningún otro desarrollo dado de
      // alta, y entonces no hay conversación que ajustar.
      return {
        responses: ['Por ahora no tengo más que mostrarte. ¿Te ayudo con algo más?'],
        shouldSend: true,
        wasDetected: true,
        isFallback: false,
      };
    }

    const options: PendingOfferOption[] = siblings.map(scope => ({
      id: scope.id,
      scopeId: scope.id,
      label: scope.name,
    }));

    if (reason === 'unanchored_affirmative') {
      // Un "sí" sin oferta no se resuelve solo aunque quede una sola opción:
      // lo que falta no es cuál desarrollo, es a qué dijo que sí.
      await userRepository.setPendingOffer(user.id, '', null, options);
      return {
        responses: ['¡Claro! ¿A cuál te refieres?'],
        shouldSend: true,
        wasDetected: true,
        isFallback: false,
      };
    }

    if (options.length === 1) {
      const only = options[0];
      await userRepository.setScopeFocus(user.id, only.scopeId, routing.hasFocus ? routing.scopeId : null);
      return { ...await this.presentFocusedScope(user, only.scopeId), scopeId: only.scopeId };
    }

    await userRepository.setPendingOffer(user.id, '', null, options);
    const bodyText = await resolveConfiguredMessage(
      'scope_disambiguation_message',
      '¿De cuál te gustaría recibir información?',
      { alcances: await this.getAvailableScopeList() }
    );
    return { responses: [bodyText], shouldSend: true, wasDetected: true, isFallback: false };
  }

  /**
   * Mencionar un alcance a secas, sin pregunta previa que repetir: se
   * presenta el alcance y, si tiene nivel siguiente, se ofrece.
   */
  private async presentFocusedScope(user: User, scopeId: string): Promise<ProcessedResponse> {
    const scopes = await scopeRepository.getScopes();
    const scope = scopes.find(candidate => candidate.id === scopeId);
    const name = scope?.name ?? '';

    const reachable = await scopeRepository.getReachableScopeIds();
    const children = scopes
      .filter(candidate => candidate.parent_id === scopeId && candidate.is_active && reachable.has(candidate.id))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));

    // Texto fijo. Quien quiera decir algo propio al nombrar un desarrollo lo
    // escribe donde se ve: en la respuesta de ese alcance.
    if (children.length === 0) {
      return {
        responses: [`¡Claro! Te platico de ${name}. ¿Qué te gustaría saber?`],
        shouldSend: true,
        wasDetected: true,
        isFallback: false,
      };
    }

    const options: PendingOfferOption[] = children.map(child => ({
      id: child.id,
      scopeId: child.id,
      label: child.name,
    }));
    await userRepository.setPendingOffer(user.id, '', scopeId, options);

    // Texto fijo: con dos niveles --negocio y desarrollos-- no se llega aquí.
    return {
      responses: [`${name}. ¿Cuál te muestro?`],
      shouldSend: true,
      wasDetected: true,
      isFallback: false,
    };
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
    if (intent.intent_name === CITA_INTENT_NAME) {
      await leadScorer.afterScopeInteraction(userId, resolvedScopeId);

      // Interruptor de prueba: en 'whatsapp_flow' se manda el formulario
      // nativo en vez de la máquina de estados por texto. La máquina de
      // estados sigue intacta como respaldo — basta con quitar/cambiar esta
      // variable de entorno para volver a ella sin tocar código.
      if (process.env.APPOINTMENT_FLOW_MODE === 'whatsapp_flow') {
        await appointmentManager.startFlowViaWhatsAppFlow(userId, user.phone_number, resolvedScopeId);
        return [];
      }

      const flowResult = await appointmentManager.startFlow(userId, true, resolvedScopeId);
      return [flowResult.message];
    }

    // Igual que "cita": "asesor" tampoco depende de que exista una fila en
    // `intent_configurations`, es la misma derivación que dispara el nivel 3
    // de fallback, sin esperar a que el lead agote sus intentos.
    if (intent.intent_name === DERIVATION_INTENT_NAME) {
      await leadScorer.afterScopeInteraction(userId, resolvedScopeId);
      const derivationMessage = await fallbackHandler.startDerivation(userId, resolvedScopeId);
      return [derivationMessage];
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
    const responseIntentIds = intent.response_intent_ids || intent.intent_id;
    const responses = await conversationRepository.getBotResponses(
      responseIntentIds,
      { alcances: scopeList, nombre: user.name ?? '', telefono: user.phone_number },
      resolvedScopeId
    );

    // Una respuesta compilada que termina en pregunta de sí/no declara qué
    // ofrece: deja constancia para que el afirmativo del lead se resuelva
    // contra ella en vez de caer al matcher.
    // El paso siguiente lo compone el sistema, no lo redacta el modelo.
    //
    // Se intento pidiendole que declarara que ofrecia --`offers_intent_name`--
    // y no lo declara nunca: las respuestas salian cerrando con "¿te comparto
    // la siguiente opcion?" y detras no habia nada, que es justo el callejon
    // que la regla queria evitar. Y no hacia falta preguntarselo: el sistema ya
    // sabe que preguntas tiene vivas en ese alcance, y son exactamente las que
    // puede ofrecer. Deterministico, sin modelo, y el toque llega como
    // identificador.
    const declaredOffer = await conversationRepository.getResponseOffer(responseIntentIds, resolvedScopeId);

    // Los botones son los que se escriben a mano, y nada mas. El sistema ya
    // no inventa sugerencias de seguimiento cuando la respuesta no trae
    // ninguno: quien configura decide cuando hay botones y cuales son: sin
    // ellos, la respuesta se manda sola.
    //
    // El alcance tiene que ser el mismo que resolvio el texto: sin el, cada
    // uno leia la fila en el orden en que llegaban los identificadores --el
    // orden que pone la deteccion, no el de la conversacion-- y el texto
    // salia de una fila mientras los botones se leian de otra. Con la
    // respuesta del negocio y botones propios, esto hacia que jamas salieran:
    // se resolvian contra la fila de un fraccionamiento, que no tenia
    // ninguno, y el sistema componia otros por su cuenta.
    const authoredButtons = await conversationRepository.getResponseButtons(responseIntentIds, resolvedScopeId);
    // Hasta diez, no tres: el formato --botones o lista-- lo decide despues
    // quien arma la presentacion (`currentOfferPresentation`), contando
    // cuantas opciones hay. Con tres o menos WhatsApp las manda como botones;
    // con cuatro o mas, como lista. No hay nada que decidir aqui.
    const offerOptions = authoredButtonsToOfferOptions(authoredButtons, resolvedScopeId);
    if (offerOptions.length > 0) {
      await userRepository.setPendingOffer(
        userId,
        declaredOffer || offerOptions[0].intentName || '',
        null,
        offerOptions
      );
    }

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

    // El saludo ya no se arma solo. Eran dos saludos automáticos que nadie
    // pidió --uno compuesto con el nombre del negocio y la lista de
    // desarrollos, otro que le pegaba la lista detrás-- y el compuesto además
    // borraba la respuesta escrita para `saludo` sin decirlo.
    //
    // Saludar es una pregunta como las demás: lo que se manda es su respuesta,
    // con los botones que lleve. Se edita donde se ven las otras.

    return responses;
  }

  private async getAvailableScopeList(): Promise<string> {
    const scopes = await scopeRoutingRepository.getAvailableScopes();
    return scopes.map(scope => `- ${scope.name}`).join('\n');
  }
}

// Singleton
export const messageProcessor = new MessageProcessor();
