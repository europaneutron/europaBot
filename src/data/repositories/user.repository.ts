/**
 * User Repository - Acceso a datos de usuarios
 */

import { supabaseServer } from '@/services/supabase/server-client';
import type { User, UserSession, UserProgress } from '@/data/models/user.model';
import { scopeRepository } from '@/data/repositories/scope.repository';

export interface UserScopeProgress {
  user_id: string;
  scope_id: string;
  lead_score: number;
  lead_status: 'cold' | 'warm' | 'hot';
  appointment_offered: boolean;
  appointment_offered_at: string | null;
  appointment_offer_responded_at: string | null;
}

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
      // Sincronizar siempre el nombre de perfil de WhatsApp si viene uno nuevo
      // WhatsApp profile name es la fuente de verdad para este campo
      if (name && name !== existing.name) {
        await supabaseServer
          .from('users')
          .update({ name })
          .eq('id', existing.id);
        existing.name = name;
      }
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

  async findByPhone(phoneNumber: string): Promise<User | null> {
    const { data, error } = await supabaseServer
      .from('users')
      .select('*')
      .eq('phone_number', phoneNumber)
      .maybeSingle();

    if (error) throw error;
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
    const { error } = await supabaseServer
      .from('user_sessions')
      .update(updates)
      .eq('user_id', userId);

    if (error) throw error;
  }

  async setScopeFocus(
    userId: string,
    scopeId: string,
    currentScopeId: string | null
  ): Promise<void> {
    const updates: Partial<UserSession> = {
      current_scope_id: scopeId,
      scope_focus_updated_at: new Date().toISOString(),
    };

    if (currentScopeId && currentScopeId !== scopeId) {
      updates.previous_scope_id = currentScopeId;
    }

    await this.updateSession(userId, updates);
  }

  async clearScopeFocus(userId: string): Promise<void> {
    await this.updateSession(userId, {
      current_scope_id: null,
      scope_focus_updated_at: null,
    });
  }

  async setPendingScopeQuestion(
    userId: string,
    message: string,
    intentName: string
  ): Promise<void> {
    await this.updateSession(userId, {
      pending_scope_message: message,
      pending_scope_intent_name: intentName,
      pending_scope_updated_at: new Date().toISOString(),
    });
  }

  async clearPendingScopeQuestion(userId: string): Promise<void> {
    await this.updateSession(userId, {
      pending_scope_message: null,
      pending_scope_intent_name: null,
      pending_scope_updated_at: null,
    });
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
   * Marcar checkpoint como completado (tabla dinamica user_checkpoints)
   */
  async markCheckpointCompleted(
    userId: string,
    scopeId: string,
    intentName: string
  ): Promise<void> {
    const { error } = await supabaseServer
      .from('user_checkpoints')
      .upsert({
        user_id: userId,
        scope_id: scopeId,
        intent_name: intentName,
        completed_at: new Date().toISOString()
      }, { onConflict: 'user_id,scope_id,intent_name' });

    if (error) throw error;
  }

  /**
   * Verificar si checkpoint ya fue completado
   */
  async isCheckpointCompleted(
    userId: string,
    scopeId: string,
    intentName: string
  ): Promise<boolean> {
    const { data, error } = await supabaseServer
      .from('user_checkpoints')
      .select('id')
      .eq('user_id', userId)
      .eq('scope_id', scopeId)
      .eq('intent_name', intentName)
      .maybeSingle();

    if (error) throw error;

    return !!data;
  }

  /**
   * Contar checkpoints completados (solo intenciones activas con is_checkpoint=true)
   */
  async countCompletedCheckpoints(userId: string, scopeId?: string): Promise<number> {
    // Obtener nombres de intenciones que son checkpoint activo
    const { data: checkpointIntents } = await supabaseServer
      .from('intent_configurations')
      .select('intent_name')
      .eq('is_checkpoint', true)
      .eq('is_active', true);

    if (!checkpointIntents || checkpointIntents.length === 0) return 0;

    const intentNames = Array.from(new Set(checkpointIntents.map(i => i.intent_name)));

    let query = supabaseServer
      .from('user_checkpoints')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('intent_name', intentNames);

    if (scopeId) {
      const branchScopeIds = await scopeRepository.getScoringScopeIds(scopeId);
      if (branchScopeIds.length === 0) return 0;
      query = query.in('scope_id', branchScopeIds);
    }

    const { count, error } = await query;
    if (error) throw error;

    return count ?? 0;
  }

  async getScopeProgress(
    userId: string,
    scopeId: string
  ): Promise<UserScopeProgress | null> {
    const { data, error } = await supabaseServer
      .from('user_scope_progress')
      .select('user_id, scope_id, lead_score, lead_status, appointment_offered, appointment_offered_at, appointment_offer_responded_at')
      .eq('user_id', userId)
      .eq('scope_id', scopeId)
      .maybeSingle();

    if (error) throw error;
    return data as UserScopeProgress | null;
  }

  async getScopeProgressMany(
    userId: string,
    scopeIds: string[]
  ): Promise<UserScopeProgress[]> {
    if (scopeIds.length === 0) return [];

    const { data, error } = await supabaseServer
      .from('user_scope_progress')
      .select('user_id, scope_id, lead_score, lead_status, appointment_offered, appointment_offered_at, appointment_offer_responded_at')
      .eq('user_id', userId)
      .in('scope_id', scopeIds);

    if (error) throw error;
    return (data || []) as UserScopeProgress[];
  }

  async saveScopeLeadScore(
    userId: string,
    scopeId: string,
    score: number,
    status: UserScopeProgress['lead_status']
  ): Promise<void> {
    // La función de base de datos actualiza el detalle y el máximo agregado en
    // una transacción. No debe existir otro camino que escriba ambas cifras.
    const { error } = await supabaseServer.rpc('save_scope_lead_score', {
      p_user_id: userId,
      p_scope_id: scopeId,
      p_lead_score: score,
      p_lead_status: status,
    });

    if (error) throw error;
  }

  async hasAppointmentBeenOffered(userId: string, scopeId: string): Promise<boolean> {
    const progress = await this.getScopeProgress(userId, scopeId);
    return progress?.appointment_offered ?? false;
  }

  async markAppointmentOffered(userId: string, scopeId: string): Promise<void> {
    const offeredAt = new Date().toISOString();
    const { error: scopeError } = await supabaseServer
      .from('user_scope_progress')
      .upsert({
        user_id: userId,
        scope_id: scopeId,
        appointment_offered: true,
        appointment_offered_at: offeredAt,
      }, { onConflict: 'user_id,scope_id' });

    if (scopeError) throw scopeError;

    const progress = await this.getProgress(userId);
    const { error: personError } = await supabaseServer
      .from('user_progress')
      .update({
        appointment_offered: true,
        appointment_offered_at: offeredAt,
        appointment_offer_count: (progress?.appointment_offer_count ?? 0) + 1,
        last_appointment_offer_at: offeredAt,
      })
      .eq('user_id', userId);

    if (personError) throw personError;
  }

  async markAppointmentOfferResponded(userId: string, scopeId: string): Promise<void> {
    const { error } = await supabaseServer
      .from('user_scope_progress')
      .update({ appointment_offer_responded_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('scope_id', scopeId);

    if (error) throw error;
  }

  async markAppointmentOfferRejected(userId: string): Promise<void> {
    const { error } = await supabaseServer
      .from('user_progress')
      .update({ last_appointment_offer_rejected_at: new Date().toISOString() })
      .eq('user_id', userId);

    if (error) throw error;
  }

  async isAppointmentOfferCoolingDown(
    userId: string,
    cooldownHours: number
  ): Promise<boolean> {
    const progress = await this.getProgress(userId);
    if (!progress?.last_appointment_offer_rejected_at) return false;

    const rejectedAt = new Date(progress.last_appointment_offer_rejected_at).getTime();
    return Number.isFinite(rejectedAt)
      && Date.now() - rejectedAt < cooldownHours * 60 * 60 * 1000;
  }

  async resetProgressForTesting(userId: string): Promise<void> {
    const { error: checkpointError } = await supabaseServer
      .from('user_checkpoints')
      .delete()
      .eq('user_id', userId);
    if (checkpointError) throw checkpointError;

    const { error: scopeProgressError } = await supabaseServer
      .from('user_scope_progress')
      .delete()
      .eq('user_id', userId);
    if (scopeProgressError) throw scopeProgressError;

    const { error: progressError } = await supabaseServer
      .from('user_progress')
      .update({
        precio_completed: false,
        precio_completed_at: null,
        ubicacion_completed: false,
        ubicacion_completed_at: null,
        modelo_completed: false,
        modelo_completed_at: null,
        creditos_completed: false,
        creditos_completed_at: null,
        seguridad_completed: false,
        seguridad_completed_at: null,
        brochure_completed: false,
        brochure_completed_at: null,
        appointment_offered: false,
        appointment_offered_at: null,
        appointment_offer_count: 0,
        last_appointment_offer_at: null,
        last_appointment_offer_rejected_at: null,
        appointment_flow_state: null,
        appointment_flow_data: null,
        last_intent: null,
        last_intent_at: null,
      })
      .eq('user_id', userId);
    if (progressError) throw progressError;

    const { error: userError } = await supabaseServer
      .from('users')
      .update({ lead_score: 0, lead_status: 'cold' })
      .eq('id', userId);
    if (userError) throw userError;
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
    step: 'pending_auto_offer' | 'ask_confirmation' | 'ask_date' | 'confirm_date' | 'ask_time' | 'ask_name' | 'completed'
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
   * NO resetea appointment_offered - el usuario ya recibió la oferta una vez
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
