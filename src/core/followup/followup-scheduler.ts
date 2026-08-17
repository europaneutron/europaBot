/**
 * Followup Scheduler - Detecta y programa follow-ups inteligentes
 * 
 * Responsabilidades:
 * - Detectar advisor_requests sin cita agendada
 * - Calcular el próximo slot disponible en ventana 9am-6pm
 * - Crear follow-ups programados respetando 24h cuando sea posible
 * - Evitar duplicados
 */

import { supabaseServer } from '@/services/supabase/server-client';
import { followupRepository } from '@/data/repositories/followup.repository';
import { configRepository } from '@/data/repositories/config.repository';

interface AdvisorRequestWithoutAppointment {
  id: string;
  user_id: string;
  created_at: string;
  user: {
    id: string;
    name: string | null;
    phone_number: string;
  };
}

export class FollowupScheduler {
  /**
   * Detectar y programar follow-ups para solicitudes abandonadas
   * 
   * Condiciones:
   * 1. advisor_request existe
   * 2. NO tiene cita agendada después de la solicitud
   * 3. NO tiene follow-up ya programado
   */
  async scheduleForAbandonedRequests(): Promise<number> {
    try {
      console.log('[FollowupScheduler] Detectando solicitudes abandonadas...');

      // Verificar si el sistema está activado
      const isEnabled = await configRepository.getBoolean('followup_enabled', true);
      if (!isEnabled) {
        console.log('[FollowupScheduler] Sistema desactivado en configuración');
        return 0;
      }

      // Obtener advisor_requests sin cita
      const requests = await this.getRequestsWithoutAppointment();
      console.log(`[FollowupScheduler] Encontradas ${requests.length} solicitudes sin cita`);

      let scheduled = 0;

      for (const request of requests) {
        // Verificar si ya tiene follow-up programado
        const hasFollowup = await followupRepository.hasFollowupForRequest(request.id);
        if (hasFollowup) {
          console.log(`[FollowupScheduler] Request ${request.id} ya tiene follow-up, saltando`);
          continue;
        }

        // Calcular próximo slot disponible
        const requestDate = new Date(request.created_at);
        const scheduledFor = this.calculateNextAvailableSlot(requestDate);

        // Crear follow-up programado
        await followupRepository.createScheduledFollowup({
          user_id: request.user_id,
          advisor_request_id: request.id,
          followup_type: 'advisor_request',
          delay_hours: Math.round((scheduledFor.getTime() - requestDate.getTime()) / (1000 * 60 * 60)),
          scheduled_for: scheduledFor,
          message_template: 'followup_template', // Se cargará desde bot_config al enviar
          message_variables: {
            nombre: request.user.name || 'Hola',
            telefono: request.user.phone_number
          }
        });

        console.log(`[FollowupScheduler] Programado follow-up para user ${request.user_id}:`, {
          requestDate: requestDate.toISOString(),
          scheduledFor: scheduledFor.toISOString(),
        });

        scheduled++;
      }

      console.log(`[FollowupScheduler] Total programados: ${scheduled}`);
      return scheduled;

    } catch (error) {
      console.error('[FollowupScheduler] Error:', error);
      throw error;
    }
  }

  /**
   * Calcular el próximo slot disponible para enviar follow-up
   * 
   * Algoritmo:
   * - Si solicitud fue entre 9am-6pm → mismo horario día siguiente (24h)
   * - Si solicitud fue fuera de horario → 9am día siguiente
   * 
   * @param requestCreatedAt Fecha de creación de la solicitud
   * @returns Fecha programada para envío
   */
  calculateNextAvailableSlot(requestCreatedAt: Date): Date {
    const WINDOW_START = 9;  // 9am
    const WINDOW_END = 18;   // 6pm

    const requestHour = requestCreatedAt.getHours();
    const requestMinutes = requestCreatedAt.getMinutes();

    // Crear fecha para el día siguiente
    let scheduledDate = new Date(requestCreatedAt);
    scheduledDate.setDate(scheduledDate.getDate() + 1);

    // Si la solicitud fue dentro de la ventana → mismo horario día siguiente
    if (requestHour >= WINDOW_START && requestHour < WINDOW_END) {
      scheduledDate.setHours(requestHour, requestMinutes, 0, 0);
    } 
    // Si fue fuera de horario → primer slot disponible (9am día siguiente)
    else {
      scheduledDate.setHours(WINDOW_START, 0, 0, 0);
    }

    return scheduledDate;
  }

  /**
   * Obtener advisor_requests que no tienen cita agendada
   * 
   * Query complejo que:
   * 1. Obtiene advisor_requests de las últimas 48 horas
   * 2. Excluye los que tienen appointment después de la solicitud
   * 3. Solo estado pending (no resueltos)
   */
  private async getRequestsWithoutAppointment(): Promise<AdvisorRequestWithoutAppointment[]> {
    // Fecha límite: últimas 48 horas
    const since = new Date();
    since.setHours(since.getHours() - 48);

    // 1. Obtener advisor_requests recientes pendientes
    const { data: requests, error: requestsError } = await supabaseServer
      .from('advisor_requests')
      .select(`
        id,
        user_id,
        created_at,
        user:users!inner (
          id,
          name,
          phone_number,
          is_simulated
        )
      `)
      .eq('user.is_simulated', false)
      .eq('status', 'pending')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: true });

    if (requestsError) {
      console.error('[FollowupScheduler] Error fetching requests:', requestsError);
      return [];
    }

    if (!requests || requests.length === 0) {
      return [];
    }

    // 2. Filtrar los que NO tienen cita
    const requestsWithoutAppointment: AdvisorRequestWithoutAppointment[] = [];

    for (const request of requests) {
      // Verificar si tiene appointment después de la solicitud
      const { data: appointments } = await supabaseServer
        .from('appointments')
        .select('id')
        .eq('user_id', request.user_id)
        .gte('created_at', request.created_at)
        .limit(1);

      // Si NO tiene citas, agregarlo a la lista
      if (!appointments || appointments.length === 0) {
        // user viene como array de Supabase, tomar el primer elemento
        const userData = Array.isArray(request.user) ? request.user[0] : request.user;
        
        requestsWithoutAppointment.push({
          id: request.id,
          user_id: request.user_id,
          created_at: request.created_at,
          user: userData
        });
      }
    }

    return requestsWithoutAppointment;
  }

  /**
   * Cancelar follow-ups pendientes si el usuario agenda cita
   * Llamar desde appointment-manager cuando se crea una cita
   */
  async cancelFollowupsForUser(userId: string): Promise<void> {
    try {
      await followupRepository.cancelPendingForUser(userId);
      console.log(`[FollowupScheduler] Cancelados follow-ups para user ${userId} (agendó cita)`);
    } catch (error) {
      console.error(`[FollowupScheduler] Error cancelling followups for ${userId}:`, error);
    }
  }
}

export const followupScheduler = new FollowupScheduler();
