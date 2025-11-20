/**
 * Servicio de Notificación a Asesores
 * Envía notificaciones por WhatsApp cuando un usuario es derivado
 */

import { whatsappSender } from './message-sender';
import { configRepository } from '@/data/repositories/config.repository';

interface AdvisorNotificationData {
  requestId: string;
  userName: string;
  userPhone: string;
  leadScore: number;
  leadStatus: string;
  checkpointsCompleted: number;
  fallbackCount: number;
  lastMessage: string;
  dashboardUrl?: string;
}

class AdvisorNotificationService {
  
  /**
   * Notificar al asesor sobre una derivación
   */
  async notifyAdvisorRequest(data: AdvisorNotificationData): Promise<boolean> {
    try {
      // Obtener teléfono del asesor desde configuración
      const advisorPhone = await configRepository.get('advisor_phone', '');
      
      if (!advisorPhone) {
        console.error('[AdvisorNotification] No advisor phone configured');
        return false;
      }

      // Limpiar teléfono para formato internacional
      const cleanPhone = data.userPhone.replace(/[^0-9]/g, '');
      
      // Enviar notificación usando template de WhatsApp
      await whatsappSender.sendTemplateMessage({
        to: advisorPhone,
        templateName: 'advisor_request_notification',
        languageCode: 'es_MX',
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: data.userName },
              { type: 'text', text: cleanPhone },
              { type: 'text', text: data.leadScore.toString() }
            ]
          }
        ]
      });
      
      console.log('[AdvisorNotification] Notification sent successfully via template', {
        requestId: data.requestId,
        advisorPhone
      });
      
      return true;
      
    } catch (error) {
      console.error('[AdvisorNotification] Error sending notification:', error);
      return false;
    }
  }

  /**
   * Construir mensaje de notificación formateado
   */
  private buildNotificationMessage(
    data: AdvisorNotificationData, 
    statusEmoji: string
  ): string {
    const dashboardLink = data.dashboardUrl 
      ? `\n🔗 Ver detalles: ${data.dashboardUrl}` 
      : '';
    
    return (
      `🆘 *NUEVA DERIVACIÓN A ASESOR*\n\n` +
      `👤 Usuario: *${data.userName}*\n` +
      `📱 Teléfono: ${data.userPhone}\n` +
      `📊 Lead Score: *${data.leadScore}* ${statusEmoji} (${data.leadStatus})\n` +
      `✅ Checkpoints: ${data.checkpointsCompleted}/6\n` +
      `❌ Fallbacks: ${data.fallbackCount}\n` +
      `💬 Último mensaje: "${data.lastMessage}"` +
      dashboardLink +
      `\n\n_Por favor, contacta al cliente lo antes posible._`
    );
  }

  /**
   * Obtener emoji según status del lead
   */
  private getStatusEmoji(status: string): string {
    const emojiMap: Record<string, string> = {
      'hot': '🔥',
      'warm': '🟡',
      'cold': '🔵',
      'none': '⚪'
    };
    return emojiMap[status] || '⚪';
  }

  /**
   * Notificar sobre cita agendada
   */
  async notifyAppointmentScheduled(
    advisorPhone: string,
    visitorName: string,
    date: string,
    timeSlot: string,
    userPhone: string
  ): Promise<boolean> {
    try {
      const message = (
        `📅 *NUEVA CITA AGENDADA*\n\n` +
        `👤 Visitante: *${visitorName}*\n` +
        `📱 Teléfono: ${userPhone}\n` +
        `📆 Fecha: ${date}\n` +
        `🕐 Horario: ${timeSlot}\n\n` +
        `_Por favor, confirma la disponibilidad._`
      );
      
      await whatsappSender.sendTextMessage({ to: advisorPhone, message });
      
      console.log('[AdvisorNotification] Appointment notification sent');
      return true;
      
    } catch (error) {
      console.error('[AdvisorNotification] Error sending appointment notification:', error);
      return false;
    }
  }
}

// Singleton
export const advisorNotificationService = new AdvisorNotificationService();
