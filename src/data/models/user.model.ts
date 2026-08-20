/**
 * Modelos de dominio para User
 */

/**
 * Una opción ofrecida por el bot: un alcance concreto, con el identificador
 * que el lead usará para elegirla (toque o texto) y el título que la
 * distingue de sus hermanas.
 *
 * Una oferta de una sola opción es una oferta de sí/no: el afirmativo la
 * ejecuta directo. Dos o más es una enumeración: el afirmativo no elige,
 * repite las opciones.
 */
export interface PendingOfferOption {
  id: string;
  scopeId: string;
  label: string;
  // La opcion puede apuntar a una pregunta, no solo a un alcance: "¿Te muestro
  // las amenidades?" con un boton [ Amenidades ] que la contesta. El toque
  // llega como identificador, asi que no hay coincidencia difusa de por medio.
  intentName?: string;
  // Solo se ve cuando la oferta termina mandandose como lista (4 a 10
  // opciones): una fila de lista admite una linea explicativa debajo del
  // titulo, y un boton de WhatsApp no tiene donde ponerla.
  description?: string;
}

export interface User {
  id: string;
  phone_number: string;
  name?: string;
  is_bot_active: boolean;
  current_state: string;
  lead_score: number;
  lead_status: 'cold' | 'warm' | 'hot';
  is_simulated: boolean;
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
  awaiting_advisor_name?: boolean; // Para derivación a asesor
  current_scope_id?: string | null;
  previous_scope_id?: string | null;
  scope_focus_updated_at?: string | Date | null;
  pending_scope_message?: string | null;
  pending_scope_intent_name?: string | null;
  pending_scope_updated_at?: string | Date | null;
  pending_offer_intent_name?: string | null;
  pending_offer_level?: string | null;
  pending_offer_options?: PendingOfferOption[] | null;
  pending_offer_updated_at?: string | Date | null;
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
  appointment_offer_count?: number;
  last_appointment_offer_at?: string | Date | null;
  last_appointment_offer_rejected_at?: string | Date | null;
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
