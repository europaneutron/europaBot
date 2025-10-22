/**
 * Modelos de dominio para Conversation
 */

export interface Conversation {
  id: string;
  user_id: string;
  message_id?: string;
  direction: 'incoming' | 'outgoing';
  message_text?: string;
  message_type: string;
  media_url?: string;
  detected_intent?: string;
  intent_confidence?: number;
  was_fallback: boolean;
  fallback_level?: number;
  sent_at: Date;
  created_at: Date;
}

export interface IntentLog {
  id: string;
  user_id: string;
  conversation_id: string;
  intent_name: string;
  confidence_score: number;
  matched_keywords: string[];
  fuzzy_matches: any;
  original_message: string;
  normalized_message: string;
  detected_at: Date;
}
