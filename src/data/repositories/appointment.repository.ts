/**
 * Appointment Repository
 * Manejo de operaciones de base de datos para citas
 */

import { supabaseServer } from '@/services/supabase/server-client';
import type { 
  AppointmentData, 
  AppointmentConfig, 
  TimeSlot,
  AgentConfig 
} from '@/types/appointment.types';

export class AppointmentRepository {
  /**
   * Obtener configuración de horarios activos
   */
  async getTimeSlots(): Promise<AppointmentConfig[]> {
    const { data, error } = await supabaseServer
      .from('appointment_config')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('❌ Error obteniendo time slots:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Crear nueva cita
   */
  async create(appointmentData: {
    user_id: string;
    visitor_name: string;
    requested_date: string;
    time_slot: TimeSlot;
  }): Promise<AppointmentData> {
    // Obtener configuración del time slot para llenar start/end
    const slots = await this.getTimeSlots();
    const slotConfig = slots.find(s => s.time_slot === appointmentData.time_slot);

    const { data, error } = await supabaseServer
      .from('appointments')
      .insert({
        user_id: appointmentData.user_id,
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
  async getDefaultAgent(): Promise<{ 
    phone: string; 
    name: string; 
    template: string;
    business_hours?: string;
    advisor_phone?: string;
    advisor_email?: string;
  }> {
    const { data, error} = await supabaseServer
      .from('agent_config')
      .select('default_agent_phone, default_agent_name, notification_template, business_hours, advisor_phone, advisor_email')
      .eq('is_active', true)
      .single();

    if (error || !data) {
      console.warn('⚠️  No se encontró agente en BD, usando fallback');
      
      // Fallback hardcoded
      return {
        phone: '+525512345678',
        name: 'Agente Europa',
        template: 'Hola {agent_name} 👋\n\n*{visitor_name}* está interesado en una visita al fraccionamiento.\n\n📅 Fecha solicitada: {date}\n🕐 Horario: {time_slot}\n\nPuedes comunicarte con él al: {whatsapp_link}\n\n¡Que tengas un excelente día!',
        business_hours: 'lunes a viernes 9:00 AM - 6:00 PM'
      };
    }

    return {
      phone: data.default_agent_phone,
      name: data.default_agent_name,
      template: data.notification_template,
      business_hours: data.business_hours,
      advisor_phone: data.advisor_phone,
      advisor_email: data.advisor_email
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
