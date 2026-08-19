/**
 * Appointment Repository
 * Manejo de operaciones de base de datos para citas
 */

import { supabaseServer } from '@/services/supabase/server-client';
import type { 
  AppointmentData, 
  AppointmentConfig, 
  TimeSlot,
  AgentConfig,
  ResolvedAgentConfig,
} from '@/types/appointment.types';
import { ROOT_SCOPE_ID, scopeRepository } from '@/data/repositories/scope.repository';
import { configRepository } from '@/data/repositories/config.repository';

export class AppointmentRepository {
  /**
   * Obtener configuración de horarios activos
   */
  async getTimeSlots(scopeId?: string | null): Promise<AppointmentConfig[]> {
    const { data, error } = await supabaseServer
      .from('appointment_config')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('❌ Error obteniendo time slots:', error);
      throw error;
    }

    try {
      const resolved = await scopeRepository.resolveRows<AppointmentConfig>(
        data || [],
        scopeId,
        row => row.time_slot
      );
      // resolveRows agrupa por alcance y pierde el orden que pidió la consulta.
      // Los horarios se muestran al usuario, así que el orden es parte del
      // resultado, no un detalle de la consulta.
      return resolved.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    } catch (resolutionError) {
      console.error('Error resolving scoped time slots; using root configuration:', resolutionError);
      const fallbackSlots = new Map<TimeSlot, AppointmentConfig>();
      for (const fallbackScopeId of [ROOT_SCOPE_ID, null]) {
        for (const slot of (data || []).filter(row => row.scope_id === fallbackScopeId)) {
          if (!fallbackSlots.has(slot.time_slot)) fallbackSlots.set(slot.time_slot, slot);
        }
      }
      return Array.from(fallbackSlots.values());
    }
  }

  /**
   * Crear nueva cita
   */
  async create(appointmentData: {
    user_id: string;
    visitor_name: string;
    requested_date: string;
    time_slot: TimeSlot;
  }, scopeId?: string | null): Promise<AppointmentData> {
    // Obtener configuración del time slot para llenar start/end
    const slots = await this.getTimeSlots(scopeId);
    const slotConfig = slots.find(s => s.time_slot === appointmentData.time_slot);

    const { data, error } = await supabaseServer
      .from('appointments')
      .insert({
        user_id: appointmentData.user_id,
        scope_id: scopeId ?? ROOT_SCOPE_ID,
        visitor_name: appointmentData.visitor_name,
        requested_date: appointmentData.requested_date,
        appointment_date: appointmentData.requested_date, // Usar requested_date como appointment_date
        time_slot: appointmentData.time_slot,
        time_slot_start: slotConfig?.start_time || '09:00',
        time_slot_end: slotConfig?.end_time || '18:00',
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error creando cita:', error);
      throw error;
    }

    console.log('✅ Cita creada:', data.id);
    return data;
  }

  /**
   * Marcar cita como notificada al agente
   */
  async markAgentNotified(appointmentId: string): Promise<void> {
    const { error } = await supabaseServer
      .from('appointments')
      .update({ agent_notified_at: new Date().toISOString() })
      .eq('id', appointmentId);

    if (error) {
      console.error('❌ Error marcando notificación:', error);
      throw error;
    }

    console.log('✅ Agente notificado para cita:', appointmentId);
  }

  /**
   * Obtener configuración del agente por defecto
   */
  async getDefaultAgent(scopeId?: string | null): Promise<ResolvedAgentConfig> {
    let orderedAgents: AgentConfig[] = [];
    let allAgents: AgentConfig[] = [];

    try {
      // advisor_phone, business_hours y advisor_email ya no viven aquí: ver
      // AGENTS.md sección 6. agent_config conserva solo lo que no se
      // unificó -- el teléfono y nombre del agente asignado, la plantilla.
      const { data, error } = await supabaseServer
        .from('agent_config')
        .select('id, scope_id, default_agent_phone, default_agent_name, notification_template, is_active, created_at, updated_at')
        .eq('is_active', true);

      if (error) throw error;

      allAgents = (data || []) as AgentConfig[];
      const resolutionOrder = await scopeRepository.getResolutionOrder(scopeId);
      orderedAgents = resolutionOrder.flatMap(resolvedScopeId =>
        allAgents.filter(agent => agent.scope_id === resolvedScopeId)
      );
    } catch (resolutionError) {
      // Se degrada a la configuración raíz aun cuando se pidió un alcance
      // concreto. La notificación puede acabar en el asesor de otro desarrollo,
      // pero es una persona real de la misma empresa que puede reencaminar el
      // lead; no notificar a nadie lo pierde. Es lo contrario al caso del
      // teléfono sembrado por la migración 004, donde el respaldo era un número
      // de prueba que nadie revisa y por eso sí se prefiere fallar.
      console.error('Error resolving scoped agent configuration; using bot_config:', resolutionError);
      orderedAgents = [ROOT_SCOPE_ID, null].flatMap(fallbackScopeId =>
        allAgents.filter(agent => agent.scope_id === fallbackScopeId)
      );
    }

    // Única fuente para el teléfono del asesor, el horario y el correo:
    // `bot_config` acotado por alcance, con la misma herencia que el resto
    // del contenido. Un desarrollo con asesor propio deriva al suyo; el que
    // no tiene hereda el del negocio (scope_id NULL, lo que edita Ajustes).
    let scopedAdvisorConfig: Record<string, string> = {};
    try {
      scopedAdvisorConfig = await configRepository.getManyByScope(
        ['advisor_phone', 'business_hours', 'advisor_email'],
        scopeId
      );
    } catch (advisorConfigError) {
      console.error('Error loading scoped advisor configuration:', advisorConfigError);
    }

    const firstValue = (
      valueOf: (agent: AgentConfig) => string | null | undefined
    ): string | undefined => {
      for (const agent of orderedAgents) {
        const value = valueOf(agent)?.trim();
        if (value) return value;
      }
      return undefined;
    };

    // default_agent_phone NO participa. Es NOT NULL y viene sembrado por la
    // migración 004 con un número de prueba, así que usarlo como respaldo
    // reproduce exactamente la falla silenciosa que este diseño evita: en una
    // base recién migrada, donde nadie ha configurado el teléfono en Ajustes,
    // las notificaciones saldrían a un número que nadie revisa y ningún error
    // lo delataría. Además son conceptos distintos: default_agent_phone es el
    // teléfono del agente asignado, no el destino de las notificaciones.
    //
    // Si no hay teléfono en el alcance ni en sus ancestros, la derivación
    // falla de forma visible en vez de usar uno por omisión.
    const advisorPhone = scopedAdvisorConfig.advisor_phone?.trim();

    if (!advisorPhone) {
      throw new Error(
        'No hay teléfono de asesor configurado en bot_config para este alcance ni sus ancestros'
      );
    }

    return {
      phone: advisorPhone,
      advisor_phone: advisorPhone,
      name: firstValue(agent => agent.default_agent_name),
      template: firstValue(agent => agent.notification_template),
      business_hours: scopedAdvisorConfig.business_hours?.trim() || undefined,
      advisor_email: scopedAdvisorConfig.advisor_email?.trim() || undefined,
    };
  }

  /**
   * Obtener citas de un usuario
   */
  async getByUserId(userId: string, limit = 10): Promise<AppointmentData[]> {
    const { data, error } = await supabaseServer
      .from('appointments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('❌ Error obteniendo citas del usuario:', error);
      throw error;
    }

    return data || [];
  }

  async hasActiveInScopes(userId: string, scopeIds: string[]): Promise<boolean> {
    if (scopeIds.length === 0) return false;

    const { data, error } = await supabaseServer
      .from('appointments')
      .select('id')
      .eq('user_id', userId)
      .in('scope_id', scopeIds)
      .in('status', ['pending', 'confirmed'])
      .limit(1);

    if (error) throw error;
    return (data?.length ?? 0) > 0;
  }

  async getByScopeId(scopeId: string, limit = 100): Promise<AppointmentData[]> {
    const { data, error } = await supabaseServer
      .from('appointments')
      .select('*')
      .eq('scope_id', scopeId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  /**
   * Actualizar estado de cita
   */
  async updateStatus(
    appointmentId: string, 
    status: 'confirmed' | 'cancelled' | 'completed'
  ): Promise<void> {
    const updateData: any = { status, updated_at: new Date().toISOString() };

    if (status === 'confirmed') {
      updateData.confirmed_at = new Date().toISOString();
    } else if (status === 'cancelled') {
      updateData.cancelled_at = new Date().toISOString();
    }

    const { error } = await supabaseServer
      .from('appointments')
      .update(updateData)
      .eq('id', appointmentId);

    if (error) {
      console.error('❌ Error actualizando estado de cita:', error);
      throw error;
    }

    console.log(`✅ Cita ${appointmentId} actualizada a: ${status}`);
  }
}

export const appointmentRepository = new AppointmentRepository();
