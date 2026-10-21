/** Registro persistido de una llamada, incluso cuando el proveedor falla. */
export interface AiModelCall {
  id: string;
  user_id: string;
  conversation_id: string | null;
  message_id: string;
  call_type: 'responder' | 'classifier';
  model: string;
  input_tokens: number | null;
  cache_read_input_tokens: number | null;
  cache_creation_input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number;
  tools_called: unknown[];
  guards_applied: unknown[];
  fallback_reason: string | null;
  error_type: string | null;
  context_size_chars: number;
  created_at: string;
}
