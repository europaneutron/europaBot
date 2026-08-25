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
  | 'confirm_date'  // Confirmar fecha interpretada
  | 'ask_time'
  | 'ask_name'
  | 'awaiting_flow'  // Se mandó un WhatsApp Flow nativo, esperando el nfm_reply
  | 'completed';

/**
 * Lo que llega en `interactive.nfm_reply.response_json` cuando el lead
 * termina el WhatsApp Flow de agendamiento. Los nombres coinciden con los
 * `name` de cada componente en el flow JSON (ver
 * scratchpad/appointment-flow.json), no con `AppointmentFlowData` a propósito:
 * son dos capas distintas, esta es la entrada sin validar todavía.
 */
export interface AppointmentFlowSubmission {
  booking_date?: string; // YYYY-MM-DD, tal como lo entrega el DatePicker nativo
  time_slot?: string;    // id del RadioButtonsGroup: morning | afternoon | evening
  visitor_name?: string;
}

/**
 * Configuración de horarios desde BD
 */
export interface AppointmentConfig {
  id: number;
  scope_id: string | null;
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
  scope_id: string;
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
  scope_id?: string;
  offer_scope_id?: string;
}

/**
 * Configuración de agente desde BD
 */
export interface AgentConfig {
  id: number;
  scope_id: string | null;
  default_agent_phone: string;
  default_agent_name: string;
  notification_template: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ResolvedAgentConfig {
  phone: string;
  name?: string;
  template?: string;
  business_hours?: string;
  advisor_phone: string;
  advisor_email?: string;
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
