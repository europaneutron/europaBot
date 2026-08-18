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
import { clientBrandRepository } from '@/data/repositories/client-brand.repository';
import { composeBusinessGreeting, toClientVocabulary } from '@/core/onboarding/client-vocabulary';
import { withContentVersionScope } from '@/lib/server/content-version-scope';
import { isAffirmative, isPureAffirmative } from './affirmative-phrases';
import { isSiblingRequest } from './sibling-request';
import {
  buildScopeOptions,
  resolveLevelAnswer,
  MAX_LIST_OPTIONS,
} from './scope-enumeration.service';
import {
  isPendingOfferFresh,
  resolvePendingOfferSelection,
} from './pending-offer-messages';

// Fuentes de foco que pueden reanudar una pregunta retenida: las tres nacen de
// algo que el lead acaba de decir o traer. El foco heredado de la sesión no
// cuenta, porque entonces la pregunta se reanudaría en cada mensaje siguiente.
const RESUMING_FOCUS_SOURCES: ScopeFocusSource[] = ['alias', 'referral', 'override'];

// Intenciones que no son una pregunta que repetir sino un flujo que arranca.
// Mencionar un alcance a secas repite la última pregunta contestada, y con
// `cita` ahí dentro eso significaba volver a abrir el agendamiento: un lead que
// cancelaba y decía "Altabrisa" recibía otra vez "¿qué día te gustaría
// visitarnos?". Repetir una pregunta es contestar de nuevo; reabrir un flujo no.
const FLOW_INTENT_NAMES = new Set(['cita']);

function isPendingQuestionFresh(session: UserSession | null): boolean {
  if (!session?.pending_scope_message || !session.pending_scope_updated_at) return false;
  const askedAt = new Date(session.pending_scope_updated_at).getTime();
  return Number.isFinite(askedAt) && Date.now() - askedAt < SCOPE_FOCUS_WINDOW_MS;
}

export interface ProcessMessageOptions {
  scopeId?: string;
  referralAdId?: string;
  suppressExternalMessages?: boolean;
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
        return {
          ...await this.presentSiblings(user, routing),
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

      // Mencionar un alcance a secas no pregunta nada nuevo: repite ahí la
      // última pregunta que sí se contestó en la conversación, aunque esa
      // respuesta no haya dejado pendiente ninguna desambiguación.
      const isFreshMention = RESUMING_FOCUS_SOURCES.includes(routing.source);
      if (
        !detectionResult.detected
        && isFreshMention
        && sessionBeforeRouting?.last_intent_detected
        && !FLOW_INTENT_NAMES.has(sessionBeforeRouting.last_intent_detected)
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
          ...await fallbackHandler.handle(user.id, messageText),
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
          ...await fallbackHandler.handle(user.id, messageText),
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
   * Construye la pregunta de desambiguación: lo cierto en el nivel de la
   * duda primero, las opciones enumeradas después. `null` cuando hay más
   * opciones de las que WhatsApp permite enumerar y el catálogo no tiene
   * ningún criterio para estrechar.
   */
  private async buildDisambiguationPlan(
    intentName: string,
    dependency: { level: string; candidateIds: string[] }
  ): Promise<{ bodyText: string; options: PendingOfferOption[] } | null> {
    if (dependency.candidateIds.length > MAX_LIST_OPTIONS) return null;

    const [preface, options] = await Promise.all([
      resolveLevelAnswer(intentName, dependency.level),
      buildScopeOptions(dependency.candidateIds, intentName),
    ]);
    if (options.length === 0) return null;

    const prompt = preface
      ? await resolveConfiguredMessage('scope_disambiguation_followup_message', '¿Cuál te muestro?')
      : await resolveConfiguredMessage(
          'scope_disambiguation_message',
          '¿De cuál te gustaría recibir información?'
        );

    return {
      bodyText: [preface, prompt].filter(Boolean).join('\n\n'),
      options,
    };
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
      const bodyText = await resolveConfiguredMessage(
        'pending_offer_repeat_message',
        'No elige por sí sola: ¿cuál de estas te muestro?'
      );
      return { responses: [bodyText], shouldSend: true, wasDetected: true, isFallback: false, scopeId: offer.current_scope_id ?? undefined };
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
   * Pedir otro es pedir los hermanos del alcance en foco. Sin hermanos, sube
   * un nivel y ofrece lo que sí hay; sin foco, enumera el primer nivel.
   */
  private async presentSiblings(
    user: User,
    routing: ScopeRoutingResult,
    reason: 'siblings' | 'unanchored_affirmative' = 'siblings'
  ): Promise<ProcessedResponse> {
    let siblings = routing.hasFocus
      ? await scopeRoutingRepository.getSiblingScopes(routing.scopeId)
      : [];
    const hadNoSiblings = routing.hasFocus && siblings.length === 0;

    if (siblings.length === 0) {
      siblings = (await scopeRoutingRepository.getAvailableScopes())
        .filter(scope => scope.id !== routing.scopeId);
    }

    if (siblings.length === 0) {
      const bodyText = await resolveConfiguredMessage(
        'sibling_none_message',
        'No tengo más opciones que mostrarte por ahora. ¿En qué más puedo ayudarte?'
      );
      return { responses: [bodyText], shouldSend: true, wasDetected: true, isFallback: false };
    }

    const options: PendingOfferOption[] = siblings.map(scope => ({
      id: scope.id,
      scopeId: scope.id,
      label: scope.name,
    }));
    await userRepository.setPendingOffer(user.id, '', null, options);

    if (reason === 'unanchored_affirmative') {
      const bodyText = await resolveConfiguredMessage(
        'unanchored_affirmative_message',
        '¿Sí a qué? Esto es lo que tengo disponible:'
      );
      return { responses: [bodyText], shouldSend: true, wasDetected: true, isFallback: false };
    }

    const bodyText = await resolveConfiguredMessage(
      hadNoSiblings ? 'sibling_up_message' : 'sibling_message',
      hadNoSiblings
        ? 'No tengo más para ese; esto es lo que sí tengo:'
        : '¿Cuál de estas te interesa?'
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

    if (children.length === 0) {
      const bodyText = await resolveConfiguredMessage(
        'scope_only_presentation_message',
        '{alcance}. ¿En qué más puedo ayudarte?',
        { alcance: name }
      );
      return { responses: [bodyText], shouldSend: true, wasDetected: true, isFallback: false };
    }

    const options: PendingOfferOption[] = children.map(child => ({
      id: child.id,
      scopeId: child.id,
      label: child.name,
    }));
    await userRepository.setPendingOffer(user.id, '', scopeId, options);

    const bodyText = await resolveConfiguredMessage(
      'scope_next_level_message',
      '{alcance}. ¿Cuál te muestro?',
      { alcance: name }
    );
    return { responses: [bodyText], shouldSend: true, wasDetected: true, isFallback: false };
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
    const responseIntentIds = intent.response_intent_ids || intent.intent_id;
    const responses = await conversationRepository.getBotResponses(
      responseIntentIds,
      { alcances: scopeList, nombre: user.name ?? '', telefono: user.phone_number }
    );

    // Una respuesta compilada que termina en pregunta de sí/no declara qué
    // ofrece: deja constancia para que el afirmativo del lead se resuelva
    // contra ella en vez de caer al matcher.
    const declaredOffer = await conversationRepository.getResponseOffer(responseIntentIds);
    if (declaredOffer) {
      await userRepository.setPendingOffer(userId, declaredOffer, null, [
        { id: resolvedScopeId, scopeId: resolvedScopeId, label: '' },
      ]);
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

    if (intent.intent_name === 'saludo') {
      const scopes = await scopeRoutingRepository.getAvailableScopes();
      const brand = await clientBrandRepository.get();
      if (brand.use_composed_greeting && brand.business_name) {
        const projectNames = scopes
          .filter(scope => scope.id !== ROOT_SCOPE_ID)
          .map(scope => scope.name);
        responses.splice(0, responses.length, composeBusinessGreeting(
          brand.business_name,
          projectNames,
          toClientVocabulary(brand)
        ));
      } else if (!hasFocus && scopes.length > 1) {
        responses.push(await resolveConfiguredMessage(
          'scope_presentation_message',
          '{project_plural_title} disponibles:\n\n{alcances}\n\n¿Cuál te interesa?',
          { alcances: scopeList }
        ));
      }
    }

    if (responses.length === 0) {
      return ['Gracias por tu interés. ¿En qué más puedo ayudarte?'];
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
