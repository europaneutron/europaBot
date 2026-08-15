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
import { FallbackLevel } from './fallback-levels.enum';
import { FALLBACK_MESSAGES } from './fallback-messages';
import type { User, UserSession } from '@/data/models/user.model';
import type { ProcessedResponse } from '@/core/conversation/message-processor';

export class FallbackHandler {
  /**
   * Manejar fallback (mensaje no entendido)
   * 
   * @param userId - ID del usuario
   * @param messageText - Texto del mensaje no entendido
   * @returns Respuesta procesada con mensaje de fallback
   */
  async handle(userId: string, messageText: string): Promise<ProcessedResponse> {
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
      fallbackDerivationEnabled
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

      if (agentConfig.business_hours) {
        confirmationMessage = await configRepository.get(
          'derivation_name_confirmed',
          'Gracias {nombre}! Un asesor se pondrá en contacto contigo pronto. En el horario de {horario}.'
        );
        confirmationMessage = confirmationMessage
          .replace('{nombre}', userName)
          .replace('{horario}', agentConfig.business_hours);
      } else {
        confirmationMessage = await configRepository.get(
          'derivation_name_confirmed_no_hours',
          'Gracias {nombre}! Un asesor se pondrá en contacto contigo pronto.'
        );
        confirmationMessage = confirmationMessage.replace('{nombre}', userName);
      }
    } catch (configurationError) {
      console.error('No fue posible resolver la configuración del asesor:', configurationError);
      confirmationMessage = await configRepository.get(
        'derivation_config_unavailable',
        'Gracias {nombre}. Registramos tu solicitud y el equipo de ventas la revisará desde el panel.'
      );
      confirmationMessage = confirmationMessage.replace('{nombre}', userName);
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
    derivationEnabled: boolean
  ): Promise<string> {
    switch (level) {
      case FallbackLevel.LEVEL_1:
        return await configRepository.get(
          'fallback_level_1',
          'No estoy seguro de entender tu pregunta. ¿Podrías reformularla de otra manera?'
        );
      
      case FallbackLevel.LEVEL_2:
        return await configRepository.get(
          'fallback_level_2',
          'Disculpa, aún no logro comprender. ¿Podrías ser más específico sobre lo que necesitas?'
        );
      
      case FallbackLevel.LEVEL_3:
        if (derivationEnabled) {
          // Verificar si ya tiene una solicitud pendiente sin atender
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
          
          return `${derivationIntro}\n\n${requestName}`;
        } else {
          // Si derivación deshabilitada, regresar a nivel 2
          return await configRepository.get(
            'fallback_level_2',
            'Disculpa, aún no logro comprender. ¿Podrías ser más específico sobre lo que necesitas?'
          );
        }
      
      default:
        return await configRepository.get(
          'fallback_level_2',
          'Disculpa, aún no logro comprender. ¿Podrías ser más específico sobre lo que necesitas?'
        );
    }
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
