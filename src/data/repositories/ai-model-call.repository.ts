import { supabaseServer } from '@/services/supabase/server-client';
import type { AiModelCall } from '@/data/models/ai-model-call.model';

export type NewAiModelCall = Omit<AiModelCall, 'id' | 'created_at'>;

export const aiModelCallRepository = {
  async save(call: NewAiModelCall): Promise<void> {
    const { error } = await supabaseServer.from('ai_model_calls').insert(call);
    if (error) throw error;
  },

  /** Las rondas de tools y los reintentos cuentan como un mensaje, no como varios. */
  async countMessagesForPhone(phone: string, since: Date): Promise<number> {
    const ids = new Set<string>();
    let offset = 0;
    while (true) {
      const { data, error } = await supabaseServer.from('ai_model_calls')
        .select('id, message_id, users!inner(phone_number)')
        .eq('users.phone_number', phone).eq('call_type', 'responder')
        .gte('created_at', since.toISOString())
        .or('fallback_reason.is.null,fallback_reason.neq.rate_limit')
        .order('id').range(offset, offset + 999);
      if (error) throw error;
      for (const row of data || []) ids.add(row.message_id);
      if (!data || data.length < 1000) return ids.size;
      offset += data.length;
    }
  },

  async listForMessage(messageId: string): Promise<AiModelCall[]> {
    const { data, error } = await supabaseServer.from('ai_model_calls').select('*')
      .eq('message_id', messageId).order('created_at');
    if (error) throw error;
    return data || [];
  },
};
