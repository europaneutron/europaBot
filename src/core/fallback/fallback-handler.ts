/**
 * Fallback Handler - Manejo completo del flujo de fallback
 * 
 * Responsabilidades:
 * - Incrementar contador de intentos fallidos
 * - Determinar nivel de fallback apropiado
 * - Generar mensajes según nivel
 * - Manejar derivación a asesor
 * - Capturar nombre del usuario para derivación
 */

import { userRepository } from '@/data/repositories/user.repository';
import { conversationRepository } from '@/data/repositories/conversation.repository';
import { configRepository } from '@/data/repositories/config.repository';
import { appointmentRepository } from '@/data/repositories/appointment.repository';
import { advisorRepository } from '@/data/repositories/advisor.repository';
import { ROOT_SCOPE_ID } from '@/data/repositories/scope.repository';
import { FallbackLevel } from './fallback-levels.enum';
import { FALLBACK_MESSAGES } from './fallback-messages';
import type { User, UserSession } from '@/data/models/user.model';
import type { ProcessedResponse } from '@/core/conversation/message-processor';
import { interpolateMessage } from '@/lib/interpolate-message';
import {
  authoredButtonsToOfferOptions,
  type AuthoredButtonDraft,
} from '@/core/conversation/pending-offer-messages';

export class FallbackHandler {
  /**
   * Manejar fallback (mensaje no entendido)
   * 
   * @param userId - ID del usuario
   * @param messageText - Texto del mensaje no entendido
   * @param scopeId - Alcance donde esta la conversacion, para que un boton sin
   *   alcance propio se quede ahi en vez de irse a la raiz.
   * @returns Respuesta procesada con mensaje de fallback
   */
  async handle(userId: string, messageText: string, scopeId?: string | null): Promise<ProcessedResponse> {
    // Incrementar contador de fallback
    const currentAttempts = await userRepository.incrementFallbackAttempts(userId);

    // Obtener configuración dinámica
    const maxFallbackAttempts = await configRepository.getInt('max_fallback_attempts', 3);
    const fallbackDerivationEnabled = await configRepository.getBoolean('fallback_derivation_enabled', true);

    // Determinar nivel de fallback
    const level = this.determineLevel(currentAttempts, maxFallbackAttempts);

    // Generar mensaje según nivel
    const fallbackMessage = await this.generateMessage(
      level,
      userId,
      fallbackDerivationEnabled,
      scopeId ?? null
    );

    // El mensaje se guarda en el webhook después de enviarlo exitosamente

    return {
      responses: [fallbackMessage],
      shouldSend: true,
      wasDetected: false,
      isFallback: true
    };
  }

  /**
   * Arrancar la derivación a asesor directo, sin pasar por el contador de
   * fallback: es lo que dispara el botón sintético "Hablar con un asesor"
   * (igual que "Agendar visita" dispara `appointmentManager.startFlow` sin
   * pasar por el nivel 3 de fallback). La lógica es la misma que el nivel 3
   * cuando la derivación está habilitada, para no mantenerla dos veces.
   *
   * @param userId - ID del usuario
   * @param scopeId - Alcance donde esta la conversacion, para los botones
   *   configurados que no traigan su propio alcance.
   * @returns El mensaje a mandar (ya interpolado, listo para enviar)
   */
  async startDerivation(userId: string, scopeId?: string | null): Promise<string> {
    const hasPending = await advisorRepository.hasPendingRequest(userId);
    if (hasPending) {
      // Ya tiene solicitud pendiente, no crear otra ni pedir nombre de nuevo
      await userRepository.resetFallbackAttempts(userId);
      return await configRepository.get(
        'derivation_already_pending',
        'Ya hemos registrado tu solicitud. Un asesor se pondrá en contacto contigo pronto. Por favor espera a ser atendido.'
      );
    }

    // Activar estado de espera de nombre
    await userRepository.updateAwaitingAdvisorName(userId, true);

    // Obtener mensajes desde configuración
    const derivationIntro = await configRepository.get(
      'derivation_intro',
      'Entiendo que necesitas ayuda más específica. Permíteme conectarte con un asesor humano que podrá atenderte mejor. 👤'
    );
    const requestName = await configRepository.get(
      'derivation_request_name',
      'Antes de conectarte con un asesor, ¿podrías compartirme tu nombre completo?'
    );

    await this.applyConfiguredButtons(userId, 'fallback_level_3_buttons', scopeId ?? null);

    return `${derivationIntro}\n\n${requestName}`;
  }

  /**
   * Los botones que se configuraron a mano para un mensaje de fallback --el
   * mismo mecanismo que usa cualquier respuesta con botones propios, ver
   * `authoredButtonsToOfferOptions`--, puestos en la oferta viva de la
   * sesión para que un toque los resuelva. Sin botones configurados, no
   * cambia nada: no hay oferta que limpiar de camino.
   *
   * @private
   */
  private async applyConfiguredButtons(
    userId: string,
    configKey: string,
    scopeId: string | null
  ): Promise<void> {
    const buttons = await configRepository.getJson<AuthoredButtonDraft[]>(configKey, []);
    const options = authoredButtonsToOfferOptions(buttons, scopeId ?? ROOT_SCOPE_ID);
    if (options.length > 0) {
      await userRepository.setPendingOffer(userId, options[0].intentName || '', null, options);
    }
  }

  /**
   * Capturar nombre del usuario para derivación a asesor
   * 
   * @param userId - ID del usuario
   * @param user - Datos del usuario
   * @param messageText - Nombre completo del usuario
   * @param session - Sesión actual del usuario
   * @returns Respuesta con confirmación de derivación
   */
  async captureAdvisorName(
    userId: string,
    user: User,
    messageText: string,
    session: UserSession,
    scopeId?: string | null
  ): Promise<ProcessedResponse> {
    // Usar el nombre capturado solo si el usuario no tiene nombre de WhatsApp
    const userName = messageText.trim();
    if (!user.name) {
      await userRepository.updateName(userId, userName);
    }

    // Verificar si ya tiene solicitud pendiente para no duplicar
    const hasPending = await advisorRepository.hasPendingRequest(userId);
    if (hasPending) {
      await userRepository.updateAwaitingAdvisorName(userId, false);
      await userRepository.resetFallbackAttempts(userId);
      const alreadyMsg = await configRepository.get(
        'derivation_already_pending',
        'Ya hemos registrado tu solicitud. Un asesor se pondrá en contacto contigo pronto. Por favor espera a ser atendido.'
      );
      return {
        responses: [alreadyMsg],
        shouldSend: true,
        wasDetected: true,
        isFallback: false
      };
    }
    
    // Obtener checkpoints completados
    const checkpointsCompleted = await userRepository.countCompletedCheckpoints(userId);
    
    // Crear solicitud de asesor
    const advisorRequest = await advisorRepository.create({
      user_id: userId,
      request_reason: 'fallback_limit',
      last_user_message: messageText,
      fallback_count: session.fallback_attempts,
      lead_score: user.lead_score,
      checkpoints_completed: checkpointsCompleted
    });
    
    // Resetear estado y contador
    await userRepository.updateAwaitingAdvisorName(userId, false);
    await userRepository.resetFallbackAttempts(userId);
    
    let confirmationMessage: string;

    try {
      const agentConfig = await appointmentRepository.getDefaultAgent(scopeId);

      // El horario solo decora el mensaje de confirmación. Si falta, se avisa
      // igual al asesor: dejar la solicitud registrada sin notificar a nadie es
      // peor que confirmar sin mencionar un horario.
      if (!user.is_simulated) {
        await this.notifyAdvisor({
          requestId: advisorRequest.id,
          userName: userName,
          userPhone: user.phone_number,
          leadScore: user.lead_score,
          leadStatus: user.lead_status,
          checkpointsCompleted: checkpointsCompleted,
          fallbackCount: session.fallback_attempts,
          lastMessage: messageText,
          advisorPhone: agentConfig.advisor_phone,
        });
      }

      if (agentConfig.business_hours) {
        confirmationMessage = await configRepository.get(
          'derivation_name_confirmed',
          'Gracias {nombre}! Un asesor se pondrá en contacto contigo pronto. En el horario de {horario}.'
        );
        confirmationMessage = interpolateMessage(confirmationMessage, {
          nombre: userName,
          horario: agentConfig.business_hours,
        }).value;
      } else {
        confirmationMessage = await configRepository.get(
          'derivation_name_confirmed_no_hours',
          'Gracias {nombre}! Un asesor se pondrá en contacto contigo pronto.'
        );
        confirmationMessage = interpolateMessage(confirmationMessage, { nombre: userName }).value;
      }
    } catch (configurationError) {
      console.error('No fue posible resolver la configuración del asesor:', configurationError);
      confirmationMessage = await configRepository.get(
        'derivation_config_unavailable',
        'Gracias {nombre}. Registramos tu solicitud y el equipo de ventas la revisará desde el panel.'
      );
      confirmationMessage = interpolateMessage(confirmationMessage, { nombre: userName }).value;
    }
    
    // El mensaje se guarda en el webhook después de enviarlo exitosamente
    
    return {
      responses: [confirmationMessage],
      shouldSend: true,
      wasDetected: true,
      isFallback: false
    };
  }

  /**
   * Determinar nivel de fallback según intentos
   * 
   * @private
   */
  private determineLevel(currentAttempts: number, maxAttempts: number): FallbackLevel {
    if (currentAttempts === 1) {
      return FallbackLevel.LEVEL_1;
    } else if (currentAttempts === 2) {
      return FallbackLevel.LEVEL_2;
    } else if (currentAttempts >= maxAttempts) {
      return FallbackLevel.LEVEL_3;
    }
    
    // Por defecto, nivel 2 (menú)
    return FallbackLevel.LEVEL_2;
  }

  /**
   * Generar mensaje según nivel de fallback
   * 
   * @private
   */
  private async generateMessage(
    level: FallbackLevel,
    userId: string,
    derivationEnabled: boolean,
    scopeId: string | null
  ): Promise<string> {
    switch (level) {
      case FallbackLevel.LEVEL_1: {
        const message = await configRepository.get(
          'fallback_level_1',
          'No estoy seguro de entender tu pregunta. ¿Podrías reformularla de otra manera?'
        );
        await this.applyConfiguredButtons(userId, 'fallback_level_1_buttons', scopeId);
        return message;
      }

      case FallbackLevel.LEVEL_2:
        return await this.getLevel2Message(userId, scopeId);

      case FallbackLevel.LEVEL_3:
        // Si la derivación está deshabilitada, se comporta como nivel 2.
        return derivationEnabled
          ? await this.startDerivation(userId, scopeId)
          : await this.getLevel2Message(userId, scopeId);

      default:
        return await this.getLevel2Message(userId, scopeId);
    }
  }

  /**
   * El texto y los botones del nivel 2, en un solo lugar: lo pide tanto ese
   * nivel como los dos casos que caen a él (derivación deshabilitada, nivel
   * sin determinar).
   *
   * @private
   */
  private async getLevel2Message(userId: string, scopeId: string | null): Promise<string> {
    const message = await configRepository.get(
      'fallback_level_2',
      'Disculpa, aún no logro comprender. ¿Podrías ser más específico sobre lo que necesitas?'
    );
    await this.applyConfiguredButtons(userId, 'fallback_level_2_buttons', scopeId);
    return message;
  }

  /**
   * Notificar al asesor sobre derivación
   * 
   * @private
   */
  private async notifyAdvisor(params: {
    requestId: string;
    userName: string;
    userPhone: string;
    leadScore: number;
    leadStatus: string;
    checkpointsCompleted: number;
    fallbackCount: number;
    lastMessage: string;
    advisorPhone?: string;
  }): Promise<void> {
    try {
      const { advisorNotificationService } = await import('@/services/whatsapp');
      await advisorNotificationService.notifyAdvisorRequest(params);
    } catch (error) {
      console.error('Error notifying advisor:', error);
      // No lanzar error, solo log (no bloquear el flujo del usuario)
    }
  }
}

// Singleton
export const fallbackHandler = new FallbackHandler();
