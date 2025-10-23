/**
 * Modelos de dominio para User
 */

export interface User {
  id: string;
  phone_number: string;
  name?: string;
  is_bot_active: boolean;
  current_state: string;
  lead_score: number;
  lead_status: 'cold' | 'warm' | 'hot';
  first_contact_at: Date;
  last_interaction_at: Date;
  preferred_language: string;
  timezone: string;
  created_at: Date;
  updated_at: Date;
}

export interface UserSession {
  id: string;
  user_id: string;
  current_flow?: string;
  last_intent_detected?: string;
  fallback_attempts: number;
  last_fallback_at?: Date;
  conversation_context: any[];
  session_started_at: Date;
  updated_at: Date;
}

export interface UserProgress {
  id: string;
  user_id: string;
  precio_completed: boolean;
  precio_completed_at?: Date;
  ubicacion_completed: boolean;
  ubicacion_completed_at?: Date;
  modelo_completed: boolean;
  modelo_completed_at?: Date;
  creditos_completed: boolean;
  creditos_completed_at?: Date;
  seguridad_completed: boolean;
  seguridad_completed_at?: Date;
  brochure_completed: boolean;
  brochure_completed_at?: Date;
  appointment_offered: boolean;
  appointment_offered_at?: Date;
  // Campos para flujo de citas
  appointment_flow_state?: string;
  appointment_flow_data?: any;
  // Campos para contexto de conversación
  last_intent?: string;
  last_intent_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export type CheckpointKey = 'precio' | 'ubicacion' | 'modelo' | 'creditos' | 'seguridad' | 'brochure';
