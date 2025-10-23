/**
 * User Repository - Acceso a datos de usuarios
 */

import { supabaseServer } from '@/services/supabase/server-client';
import type { User, UserSession, UserProgress, CheckpointKey } from '@/data/models/user.model';

export class UserRepository {
  /**
   * Buscar o crear usuario por teléfono
   */
  async findOrCreateByPhone(phoneNumber: string, name?: string): Promise<User> {
    // Intentar buscar primero
    const { data: existing } = await supabaseServer
      .from('users')
      .select('*')
      .eq('phone_number', phoneNumber)
      .single();

    if (existing) {
      return existing;
    }

    // Crear nuevo usuario
    const { data: newUser, error } = await supabaseServer
      .from('users')
      .insert({
        phone_number: phoneNumber,
        name: name || null,
        is_bot_active: true,
        current_state: 'active',
        lead_score: 0,
        lead_status: 'cold'
      })
      .select()
      .single();

    if (error) throw error;

    // Crear session y progress asociados
    await this.initializeUserData(newUser.id);

    return newUser;
  }

  /**
   * Inicializar session y progress de nuevo usuario
   */
  private async initializeUserData(userId: string): Promise<void> {
    // Crear user_session
    await supabaseServer.from('user_sessions').insert({
      user_id: userId,
      fallback_attempts: 0,
      conversation_context: []
    });

    // Crear user_progress
    await supabaseServer.from('user_progress').insert({
      user_id: userId
    });

    // Crear bot_status
    await supabaseServer.from('bot_status').insert({
      user_id: userId,
      is_active: true
    });
  }

  /**
   * Obtener usuario por ID
   */
  async findById(userId: string): Promise<User | null> {
    const { data, error } = await supabaseServer
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) return null;
    return data;
  }

  /**
   * Actualizar última interacción
   */
  async updateLastInteraction(userId: string): Promise<void> {
    await supabaseServer
      .from('users')
      .update({ last_interaction_at: new Date().toISOString() })
      .eq('id', userId);
  }

  /**
   * Actualizar lead score
   */
  async updateLeadScore(userId: string, score: number): Promise<void> {
    // Determinar status basado en score
    let status: 'cold' | 'warm' | 'hot' = 'cold';
    if (score >= 70) status = 'hot';
    else if (score >= 40) status = 'warm';

    await supabaseServer
      .from('users')
      .update({ 
        lead_score: score,
        lead_status: status
      })
      .eq('id', userId);
  }

  /**
   * Obtener sesión del usuario
   */
  async getSession(userId: string): Promise<UserSession | null> {
    const { data, error } = await supabaseServer
      .from('user_sessions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) return null;
    return data;
  }

  /**
   * Actualizar sesión
   */
  async updateSession(userId: string, updates: Partial<UserSession>): Promise<void> {
    await supabaseServer
      .from('user_sessions')
      .update(updates)
      .eq('user_id', userId);
  }

  /**
   * Resetear intentos de fallback
   */
  async resetFallbackAttempts(userId: string): Promise<void> {
    await supabaseServer
      .from('user_sessions')
      .update({ 
        fallback_attempts: 0,
        last_fallback_at: null
      })
      .eq('user_id', userId);
  }

  /**
   * Incrementar contador de fallback
   */
  async incrementFallbackAttempts(userId: string): Promise<number> {
    const session = await this.getSession(userId);
    const newCount = (session?.fallback_attempts || 0) + 1;

    await supabaseServer
      .from('user_sessions')
      .update({ 
        fallback_attempts: newCount,
        last_fallback_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    return newCount;
  }

  /**
   * Obtener progreso del usuario
   */
  async getProgress(userId: string): Promise<UserProgress | null> {
    const { data, error } = await supabaseServer
      .from('user_progress')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) return null;
    return data;
  }

  /**
   * Marcar checkpoint como completado
   */
  async markCheckpointCompleted(userId: string, checkpoint: CheckpointKey): Promise<void> {
    const updates: any = {};
    updates[`${checkpoint}_completed`] = true;
    updates[`${checkpoint}_completed_at`] = new Date().toISOString();

    await supabaseServer
      .from('user_progress')
      .update(updates)
      .eq('user_id', userId);
  }

  /**
   * Verificar si checkpoint ya fue completado
   */
  async isCheckpointCompleted(userId: string, checkpoint: CheckpointKey): Promise<boolean> {
    const progress = await this.getProgress(userId);
    if (!progress) return false;
    
    return progress[`${checkpoint}_completed` as keyof UserProgress] as boolean;
  }

  /**
   * Contar checkpoints completados
   */
  async countCompletedCheckpoints(userId: string): Promise<number> {
    const progress = await this.getProgress(userId);
    if (!progress) return 0;

    let count = 0;
    const checkpoints: CheckpointKey[] = ['precio', 'ubicacion', 'modelo', 'creditos', 'seguridad', 'brochure'];
    
    for (const checkpoint of checkpoints) {
      if (progress[`${checkpoint}_completed` as keyof UserProgress]) {
        count++;
      }
    }

    return count;
  }

  /**
   * Marcar que se ofreció cita
   */
  async markAppointmentOffered(userId: string): Promise<void> {
    await supabaseServer
      .from('user_progress')
      .update({
        appointment_offered: true,
        appointment_offered_at: new Date().toISOString()
      })
      .eq('user_id', userId);
  }

  /**
   * Verificar si bot está activo para usuario
   */
  async isBotActive(userId: string): Promise<boolean> {
    const { data } = await supabaseServer
      .from('bot_status')
      .select('is_active')
      .eq('user_id', userId)
      .single();

    return data?.is_active ?? true;
  }

  // ============================================
  // Métodos para flujo de citas
  // ============================================

  /**
   * Guardar estado actual del flujo de cita
   */
  async updateAppointmentFlowState(
    userId: string, 
    step: 'pending_auto_offer' | 'ask_confirmation' | 'ask_date' | 'ask_time' | 'ask_name' | 'completed'
  ): Promise<void> {
    await supabaseServer
      .from('user_progress')
      .update({ appointment_flow_state: step })
      .eq('user_id', userId);
  }

  /**
   * Guardar datos temporales del flujo (fecha, horario)
   */
  async updateAppointmentFlowData(userId: string, data: any): Promise<void> {
    // Obtener datos actuales
    const progress = await this.getProgress(userId);
    const currentData = progress?.appointment_flow_data || {};

    // Merge con nuevos datos
    const updatedData = { ...currentData, ...data };

    await supabaseServer
      .from('user_progress')
      .update({ appointment_flow_data: updatedData })
      .eq('user_id', userId);
  }

  /**
   * Obtener datos temporales del flujo
   */
  async getAppointmentFlowData(userId: string): Promise<any> {
    const progress = await this.getProgress(userId);
    return progress?.appointment_flow_data || null;
  }

  /**
   * Obtener estado actual del flujo de cita
   */
  async getAppointmentFlowState(userId: string): Promise<string | null> {
    const progress = await this.getProgress(userId);
    return progress?.appointment_flow_state || null;
  }

  /**
   * Limpiar estado y datos del flujo de cita
   */
  async clearAppointmentFlow(userId: string): Promise<void> {
    await supabaseServer
      .from('user_progress')
      .update({ 
        appointment_flow_state: null,
        appointment_flow_data: null
      })
      .eq('user_id', userId);
  }

  /**
   * Guardar último intent detectado (para contexto de conversación)
   */
  async saveLastIntent(userId: string, intentName: string): Promise<void> {
    await supabaseServer
      .from('user_progress')
      .update({
        last_intent: intentName,
        last_intent_at: new Date().toISOString()
      })
      .eq('user_id', userId);
  }

  /**
   * Obtener último intent detectado con timestamp
   */
  async getLastIntent(userId: string): Promise<{ intent: string; timestamp: Date } | null> {
    const progress = await this.getProgress(userId);
    
    if (!progress?.last_intent || !progress?.last_intent_at) {
      return null;
    }

    return {
      intent: progress.last_intent,
      timestamp: new Date(progress.last_intent_at)
    };
  }

  /**
   * Limpiar último intent (después de ser procesado)
   */
  async clearLastIntent(userId: string): Promise<void> {
    await supabaseServer
      .from('user_progress')
      .update({
        last_intent: null,
        last_intent_at: null
      })
      .eq('user_id', userId);
  }

  /**
   * Activar/desactivar estado de espera de nombre para derivación a asesor
   */
  async updateAwaitingAdvisorName(userId: string, awaiting: boolean): Promise<void> {
    await supabaseServer
      .from('user_sessions')
      .update({ awaiting_advisor_name: awaiting })
      .eq('user_id', userId);
  }

  /**
   * Actualizar nombre del usuario
   */
  async updateName(userId: string, name: string): Promise<void> {
    await supabaseServer
      .from('users')
      .update({ name })
      .eq('id', userId);
  }
}

// Singleton
export const userRepository = new UserRepository();
