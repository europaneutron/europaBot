import {
  nextAppointmentFlowMessage,
  type FlowMessage,
} from '@/core/appointment/appointment-flow-messages';
import { supabaseServer } from '@/services/supabase/server-client';
import { scopeRepository } from './scope.repository';
import { userRepository } from './user.repository';

export interface SimulatorDiagnostic {
  scopeId: string | null;
  scopeName: string | null;
  pendingQuestion: string | null;
}

export class ConversationSimulatorRepository {
  /**
   * El mensaje con botones que el flujo de cita emitiria a continuacion.
   *
   * Lo compone `appointment-flow-messages`, el mismo modulo que usa el webhook.
   * Antes estaba escrito aqui a mano y divergia del real: sin el emoji inicial,
   * con los botones dibujados como texto entre corchetes y sin la regla de no
   * repetir la pregunta. Una pantalla que existe para enseñar lo que el bot
   * manda no puede tener su propia version de lo que el bot manda.
   */
  async getPendingFlowMessage(userId: string): Promise<FlowMessage | null> {
    return nextAppointmentFlowMessage(userId);
  }

  async getDiagnostic(userId: string, scopeId?: string | null): Promise<SimulatorDiagnostic> {
    const [session, scopes] = await Promise.all([
      userRepository.getSession(userId),
      scopeRepository.getScopes(),
    ]);
    const resolvedScopeId = session?.current_scope_id || scopeId || null;
    const scope = scopes.find(item => item.id === resolvedScopeId);
    return {
      scopeId: resolvedScopeId,
      scopeName: scope?.name || null,
      pendingQuestion: session?.pending_scope_message || null,
    };
  }

  async reset(phoneNumber: string): Promise<string> {
    const user = await userRepository.findByPhone(phoneNumber);
    if (!user || !user.is_simulated) {
      throw new Error('Lead simulado no encontrado');
    }

    await userRepository.resetProgressForTesting(user.id);

    const deletions = await Promise.all([
      supabaseServer.from('conversations').delete().eq('user_id', user.id),
      supabaseServer.from('intents_log').delete().eq('user_id', user.id),
    ]);
    const deletionError = deletions.find(result => result.error)?.error;
    if (deletionError) throw deletionError;

    const { error: sessionError } = await supabaseServer
      .from('user_sessions')
      .update({
        current_flow: null,
        last_intent_detected: null,
        fallback_attempts: 0,
        last_fallback_at: null,
        conversation_context: [],
        awaiting_advisor_name: false,
        current_scope_id: null,
        previous_scope_id: null,
        scope_focus_updated_at: null,
        pending_scope_message: null,
        pending_scope_intent_name: null,
        pending_scope_updated_at: null,
      })
      .eq('user_id', user.id);
    if (sessionError) throw sessionError;

    return user.id;
  }
}

export const conversationSimulatorRepository = new ConversationSimulatorRepository();
