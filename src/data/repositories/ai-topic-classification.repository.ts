import { supabaseServer } from '@/services/supabase/server-client';
import type { AiTopicClassification } from '@/data/models/ai-topic-classification.model';

export type NewAiTopicClassification = Omit<AiTopicClassification, 'id' | 'created_at'>;

export const aiTopicClassificationRepository = {
  /** Un mensaje, una fila: un reintento del mismo message_id reemplaza en lugar de duplicar. */
  async save(row: NewAiTopicClassification): Promise<void> {
    const { error } = await supabaseServer.from('ai_topic_classifications')
      .upsert(row, { onConflict: 'message_id' });
    if (error) throw error;
  },

  async getForMessage(messageId: string): Promise<AiTopicClassification | null> {
    const { data, error } = await supabaseServer.from('ai_topic_classifications')
      .select('*').eq('message_id', messageId).maybeSingle();
    if (error) throw error;
    return data;
  },
};
