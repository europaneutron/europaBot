/** Tema validado; el alcance nulo representa una consulta general. */
export interface ClassifiedTopic {
  intent_name: string;
  quote: string;
  clarity: 'clara' | 'dudosa';
  mentioned_scope_id: string | null;
}

export interface DiscardedTopic {
  // Conserva candidatos mal formados para poder diagnosticar el descarte.
  candidate: unknown;
  reason: string;
}

export interface AiTopicClassification {
  id: string;
  user_id: string;
  conversation_id: string | null;
  message_id: string;
  topics: ClassifiedTopic[];
  other_topic: string | null;
  discarded_topics: DiscardedTopic[];
  matcher_topics: string[];
  failure_reason: string | null;
  created_at: string;
}
