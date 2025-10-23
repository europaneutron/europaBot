/**
 * Tipos para el sistema de derivación a asesor
 */

export interface AdvisorRequest {
  id: string;
  user_id: string;
  request_reason: string;
  last_user_message: string;
  fallback_count: number;
  lead_score: number;
  checkpoints_completed: number;
  status: 'pending' | 'contacted' | 'resolved' | 'cancelled';
  assigned_to?: string;
  contacted_at?: Date;
  resolved_at?: Date;
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

export interface AdvisorRequestData {
  user_id: string;
  request_reason: string;
  last_user_message: string;
  fallback_count: number;
  lead_score: number;
  checkpoints_completed: number;
}

export interface AdvisorConfig {
  business_hours: string;
  advisor_phone: string;
  advisor_email: string;
}
