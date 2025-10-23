/**
 * Sistema de Citas - Tipos TypeScript
 * Manejo de agendamiento de visitas conversacional
 */

export type TimeSlot = 'morning' | 'afternoon' | 'evening';

export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

export type AppointmentFlowStep = 
  | 'pending_auto_offer'  // Esperando confirmación de oferta automática
  | 'ask_confirmation' 
  | 'ask_date' 
  | 'ask_time' 
  | 'ask_name' 
  | 'completed';

/**
 * Configuración de horarios desde BD
 */
export interface AppointmentConfig {
  id: number;
  time_slot: TimeSlot;
  display_name: string;
  start_time: string; // "09:00"
  end_time: string;   // "11:00"
  emoji: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Datos de una cita agendada
 */
export interface AppointmentData {
  id: string;
  user_id: string;
  visitor_name: string;
  requested_date: string; // ISO date: "2025-10-23"
  time_slot: TimeSlot;
  status: AppointmentStatus;
  assigned_agent_id?: string;
  agent_notified_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  confirmed_at?: string;
  cancelled_at?: string;
}

/**
 * Estado del flujo conversacional de cita
 */
export interface AppointmentFlow {
  step: AppointmentFlowStep;
  message: string;
  data?: Partial<AppointmentData>;
}

/**
 * Datos temporales guardados en user_progress.appointment_flow_data
 */
export interface AppointmentFlowData {
  requested_date?: string; // ISO date
  time_slot?: TimeSlot;
}

/**
 * Configuración de agente desde BD
 */
export interface AgentConfig {
  id: number;
  default_agent_phone: string;
  default_agent_name: string;
  notification_template: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Datos para notificación al agente
 */
export interface AgentNotification {
  agent_phone: string;
  agent_name: string;
  visitor_name: string;
  visitor_phone: string;
  requested_date: string;
  time_slot: string;
  time_slot_display: string;
}
