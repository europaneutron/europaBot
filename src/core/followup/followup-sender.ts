/**
 * FOLLOWUP SENDER SERVICE
 * 
 * Responsabilidad: Enviar mensajes de follow-up programados
 * 
 * Flujo:
 * 1. Obtiene mensajes pendientes (scheduled_for <= now, status='pending')
 * 2. Valida que estamos dentro de la ventana horaria (9am-6pm)
 * 3. Carga plantilla desde bot_config
 * 4. Interpola variables {nombre}, {telefono}
 * 5. Envía mensaje por WhatsApp
 * 6. Registra en conversations (direction='outbound')
 * 7. Marca como sent (executed_at)
 */

import { followupRepository, configRepository } from '@/data/repositories';
import { WhatsAppMessageSender } from '@/services/whatsapp/message-sender';
import { supabaseServer } from '@/services/supabase/server-client';

const whatsappSender = new WhatsAppMessageSender();

export class FollowupSender {
  /**
   * Envía todos los mensajes pendientes que están programados para ahora o antes
   * Solo envía si estamos dentro de la ventana horaria configurada
   */
  async sendPendingMessages(): Promise<{
    sent: number;
    skipped: number;
    errors: number;
    details: Array<{ userId: string; status: 'sent' | 'skipped' | 'error'; reason?: string }>;
  }> {
    console.log('[FollowupSender] Iniciando envío de mensajes pendientes...');

    // 1. Verificar si el sistema está habilitado
    const enabledValue = await configRepository.get('followup_enabled', 'false');
    if (enabledValue !== 'true') {
      console.log('[FollowupSender] Sistema deshabilitado en configuración');
      return { sent: 0, skipped: 0, errors: 0, details: [] };
    }

    // 2. Validar ventana horaria actual
    const now = new Date();
    const currentHour = now.getHours();
    
    const windowStart = await configRepository.get('followup_window_start', '09:00');
    const windowEnd = await configRepository.get('followup_window_end', '18:00');
    
    const startHour = parseInt(windowStart.split(':')[0]);
    const endHour = parseInt(windowEnd.split(':')[0]);

    if (currentHour < startHour || currentHour >= endHour) {
      console.log(`[FollowupSender] Fuera de ventana horaria. Hora actual: ${currentHour}, ventana: ${startHour}-${endHour}`);
      return { sent: 0, skipped: 0, errors: 0, details: [] };
    }

    // 3. Obtener mensajes pendientes
    const pendingMessages = await followupRepository.getPendingFollowups();
    console.log(`[FollowupSender] ${pendingMessages.length} mensajes pendientes encontrados`);

    if (pendingMessages.length === 0) {
      return { sent: 0, skipped: 0, errors: 0, details: [] };
    }

    // 4. Cargar plantilla desde configuración
    const template = await configRepository.get('followup_template', '');

    if (!template) {
      console.error('[FollowupSender] No se encontró plantilla en bot_config');
      return { sent: 0, skipped: 0, errors: 0, details: [] };
    }

    // 5. Procesar cada mensaje
    let sent = 0;
    let skipped = 0;
    let errors = 0;
    const details: Array<{ userId: string; status: 'sent' | 'skipped' | 'error'; reason?: string }> = [];

    for (const message of pendingMessages) {
      try {
        const userId = message.user_id;

        // 5.1. Obtener datos del usuario desde Supabase
        const supabase = supabaseServer;
        const { data: user, error: userError } = await supabase
          .from('users')
          .select('phone_number, name')
          .eq('id', userId)
          .single();

        if (userError || !user) {
          console.error(`[FollowupSender] Error obteniendo usuario ${userId}:`, userError);
          errors++;
          details.push({ userId, status: 'error', reason: 'Usuario no encontrado' });
          continue;
        }

        // 5.2. Interpolar variables en la plantilla
        const messageVariables = message.message_variables || {};
        const nombre = messageVariables.nombre || user.name || 'Hola!';
        const telefono = user.phone_number;

        let finalMessage = template
          .replace(/\{nombre\}/g, nombre)
          .replace(/\{telefono\}/g, telefono);

        // 5.3. Enviar mensaje por WhatsApp
        console.log(`[FollowupSender] Enviando mensaje a ${telefono}...`);
        const result = await whatsappSender.sendTextMessage({ 
          to: telefono, 
          message: finalMessage 
        });

        if (!result || !result.messageId) {
          console.error(`[FollowupSender] Error enviando mensaje a ${telefono}`);
          errors++;
          details.push({ userId, status: 'error', reason: 'Error al enviar por WhatsApp' });
          continue;
        }

        const sent_at = new Date().toISOString();

        // 5.4. Registrar en conversations como mensaje saliente
        const { error: conversationError } = await supabase
          .from('conversations')
          .insert({
            user_id: userId,
            message_text: finalMessage,
            direction: 'outbound',
            created_at: sent_at,
          });

        if (conversationError) {
          console.warn(`[FollowupSender] Error registrando conversación para ${userId}:`, conversationError);
          // No bloqueante, el mensaje ya se envió
        }

        // 5.5. Marcar como enviado
        try {
          await followupRepository.markAsSent(message.id);
        } catch (markError) {
          console.warn(`[FollowupSender] Error marcando como enviado: ${message.id}`, markError);
          // No bloqueante, el mensaje ya se envió
        }

        sent++;
        details.push({ userId, status: 'sent' });
        console.log(`[FollowupSender] ✅ Mensaje enviado exitosamente a ${telefono}`);

      } catch (error) {
        console.error(`[FollowupSender] Error procesando mensaje ${message.id}:`, error);
        errors++;
        details.push({ 
          userId: message.user_id, 
          status: 'error', 
          reason: error instanceof Error ? error.message : 'Error desconocido' 
        });
      }
    }

    console.log(`[FollowupSender] Resumen: ${sent} enviados, ${skipped} omitidos, ${errors} errores`);
    return { sent, skipped, errors, details };
  }

  /**
   * Marca que un usuario respondió a un follow-up (para métricas)
   */
  async markUserResponded(userId: string): Promise<void> {
    await followupRepository.markUserResponded(userId);
  }
}

// Singleton instance
export const followupSender = new FollowupSender();
