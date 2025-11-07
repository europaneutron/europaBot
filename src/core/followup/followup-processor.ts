/**
 * FOLLOWUP PROCESSOR SERVICE (Simplificado)
 * 
 * Responsabilidad: Detectar y enviar follow-ups a conversaciones abandonadas
 * 
 * Flujo único (ejecuta diario a las 9am):
 * 1. Buscar conversaciones con último mensaje hace 6-30 horas
 * 2. Filtrar: sin cita, sin advisor_request, sin followup_sent
 * 3. Enviar mensaje inmediatamente
 * 4. Marcar followup_sent = true (permanente)
 * 
 * Ventana: Ayer 3am - Hoy 3am (garantiza ~24h de WhatsApp)
 */

import { supabaseServer } from '@/services/supabase/server-client';
import { configRepository } from '@/data/repositories';
import { WhatsAppMessageSender } from '@/services/whatsapp/message-sender';

const whatsappSender = new WhatsAppMessageSender();

interface AbandonedConversation {
  user_id: string;
  phone_number: string;
  name: string | null;
  last_message_at: string;
}

export class FollowupProcessor {
  /**
   * Procesa todas las conversaciones abandonadas elegibles
   * Ejecuta una sola vez al día a las 9am
   */
  async processAbandonedConversations(): Promise<{
    processed: number;
    sent: number;
    skipped: number;
    errors: number;
    details: Array<{ userId: string; status: string; reason?: string }>;
  }> {
    console.log('[FollowupProcessor] Iniciando procesamiento diario...');

    // 1. Verificar si el sistema está habilitado
    const isEnabled = await configRepository.getBoolean('followup_enabled', true);
    if (!isEnabled) {
      console.log('[FollowupProcessor] Sistema deshabilitado en configuración');
      return { processed: 0, sent: 0, skipped: 0, errors: 0, details: [] };
    }

    // 2. Obtener conversaciones abandonadas
    const abandoned = await this.getAbandonedConversations();
    console.log(`[FollowupProcessor] ${abandoned.length} conversaciones abandonadas encontradas`);

    if (abandoned.length === 0) {
      return { processed: 0, sent: 0, skipped: 0, errors: 0, details: [] };
    }

    // 3. Cargar plantilla desde configuración
    const template = await configRepository.get('followup_template', '');
    if (!template) {
      console.error('[FollowupProcessor] No se encontró plantilla en bot_config');
      return { processed: 0, sent: 0, skipped: 0, errors: 0, details: [] };
    }

    // 4. Procesar cada conversación
    let sent = 0;
    let skipped = 0;
    let errors = 0;
    const details: Array<{ userId: string; status: string; reason?: string }> = [];

    for (const conversation of abandoned) {
      try {
        // 4.1. Verificar filtros finales
        const passesFilters = await this.checkFinalFilters(conversation.user_id);
        
        if (!passesFilters.pass) {
          skipped++;
          details.push({
            userId: conversation.user_id,
            status: 'skipped',
            reason: passesFilters.reason
          });
          continue;
        }

        // 4.2. Interpolar variables en plantilla
        const nombre = conversation.name || 'Hola!';
        const telefono = conversation.phone_number;
        
        const finalMessage = template
          .replace(/\{nombre\}/g, nombre)
          .replace(/\{telefono\}/g, telefono);

        // 4.3. Enviar mensaje por WhatsApp
        console.log(`[FollowupProcessor] Enviando follow-up a ${telefono}...`);
        const result = await whatsappSender.sendTextMessage({
          to: telefono,
          message: finalMessage
        });

        if (!result || !result.messageId) {
          console.error(`[FollowupProcessor] Error enviando a ${telefono}`);
          errors++;
          details.push({
            userId: conversation.user_id,
            status: 'error',
            reason: 'Error al enviar por WhatsApp'
          });
          continue;
        }

        const sent_at = new Date().toISOString();

        // 4.4. Registrar en conversations como outbound
        await supabaseServer
          .from('conversations')
          .insert({
            user_id: conversation.user_id,
            message: finalMessage,
            direction: 'outbound',
            created_at: sent_at
          });

        // 4.5. Marcar followup_sent = true (permanente)
        await supabaseServer
          .from('users')
          .update({ followup_sent: true })
          .eq('id', conversation.user_id);

        sent++;
        details.push({ userId: conversation.user_id, status: 'sent' });
        console.log(`[FollowupProcessor] ✅ Follow-up enviado a ${telefono}`);

      } catch (error) {
        console.error(`[FollowupProcessor] Error procesando ${conversation.user_id}:`, error);
        errors++;
        details.push({
          userId: conversation.user_id,
          status: 'error',
          reason: error instanceof Error ? error.message : 'Error desconocido'
        });
      }
    }

    const processed = sent + skipped + errors;
    console.log(`[FollowupProcessor] Resumen: ${processed} procesadas, ${sent} enviadas, ${skipped} omitidas, ${errors} errores`);
    
    return { processed, sent, skipped, errors, details };
  }

  /**
   * Obtiene conversaciones abandonadas en ventana 6-30 horas
   * 
   * Ventana: Ayer 3am - Hoy 3am
   * - Mínimo 6 horas (evita molestar muy temprano)
   * - Máximo 30 horas (garantiza ventana 24h WhatsApp)
   */
  private async getAbandonedConversations(): Promise<AbandonedConversation[]> {
    const now = new Date();
    
    // Ventana de búsqueda
    const windowEnd = new Date(now);
    windowEnd.setHours(windowEnd.getHours() - 6); // Hace 6 horas (hoy 3am)
    
    const windowStart = new Date(now);
    windowStart.setHours(windowStart.getHours() - 30); // Hace 30 horas (ayer 3am)

    console.log(`[FollowupProcessor] Ventana de búsqueda:`);
    console.log(`  Desde: ${windowStart.toISOString()} (hace 30h)`);
    console.log(`  Hasta: ${windowEnd.toISOString()} (hace 6h)`);

    const { data, error } = await supabaseServer
      .from('users')
      .select('id, phone_number, name, last_interaction_at')
      .gte('last_interaction_at', windowStart.toISOString())
      .lte('last_interaction_at', windowEnd.toISOString())
      .eq('followup_sent', false);

    if (error) {
      console.error('[FollowupProcessor] Error obteniendo conversaciones:', error);
      return [];
    }

    return (data || []).map(user => ({
      user_id: user.id,
      phone_number: user.phone_number,
      name: user.name,
      last_message_at: user.last_interaction_at
    }));
  }

  /**
   * Verifica filtros finales antes de enviar
   * - Sin cita agendada
   * - Sin solicitud de asesor
   * - Sin follow-up previo (doble check)
   */
  private async checkFinalFilters(userId: string): Promise<{ pass: boolean; reason?: string }> {
    // 1. Verificar si tiene cita
    const { data: appointment } = await supabaseServer
      .from('appointments')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (appointment) {
      return { pass: false, reason: 'Usuario ya tiene cita agendada' };
    }

    // 2. Verificar si solicitó asesor
    const { data: advisorRequest } = await supabaseServer
      .from('advisor_requests')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (advisorRequest) {
      return { pass: false, reason: 'Usuario ya solicitó asesor' };
    }

    // 3. Doble check de followup_sent (por si acaso)
    const { data: user } = await supabaseServer
      .from('users')
      .select('followup_sent')
      .eq('id', userId)
      .single();

    if (user?.followup_sent === true) {
      return { pass: false, reason: 'Usuario ya recibió follow-up anteriormente' };
    }

    return { pass: true };
  }
}

// Singleton instance
export const followupProcessor = new FollowupProcessor();
