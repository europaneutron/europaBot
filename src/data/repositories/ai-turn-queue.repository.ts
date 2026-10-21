import { supabaseServer } from '@/services/supabase/server-client';

export const aiTurnQueueRepository = {
  async enqueue(userId: string, messageId: string, staleSeconds: number): Promise<void> {
    const { error } = await supabaseServer.rpc('enqueue_ai_turn', {
      p_user_id: userId, p_message_id: messageId, p_stale_seconds: staleSeconds,
    });
    if (error) throw error;
  },

  async isNext(userId: string, messageId: string, staleSeconds: number): Promise<boolean> {
    const { data, error } = await supabaseServer.rpc('is_ai_turn_next', {
      p_user_id: userId, p_message_id: messageId, p_stale_seconds: staleSeconds,
    });
    if (error) throw error;
    return data === true;
  },

  async release(messageId: string): Promise<void> {
    const { error } = await supabaseServer.from('ai_turn_queue').delete().eq('message_id', messageId);
    if (error) throw error;
  },
};
