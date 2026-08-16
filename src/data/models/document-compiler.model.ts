export type CompilerStage =
  | 'ingest'
  | 'extract_facts'
  | 'consolidate_facts'
  | 'tree'
  | 'catalog'
  | 'content'
  | 'review'
  | 'completed';

export type ReviewSignal =
  | 'unsupported'
  | 'contradiction'
  | 'uncertain_provenance'
  | 'sensitive_data'
  | 'changed'
  | 'human_edited';

export interface ExtractedFact {
  id?: string;
  materialId: string;
  scopeId: string;
  key: string;
  subject?: string | null;
  value: unknown;
  type: string;
  page: number;
  provenanceConfidence: number;
  fingerprint: string;
  contradictory?: boolean;
}

export interface CandidateQuestion {
  intentName: string;
  question: string;
  source: 'preset' | 'material' | 'fallback';
  factKeys: string[];
}

export interface CompilerProposal {
  id: string;
  run_id: string;
  scope_id: string;
  intent_id: string;
  response_key: string;
  message_text: { fragments: Array<{ type: 'text'; content: string; delay: number }> };
  matcher_patterns: Record<string, string[]>;
  approval_status: 'pending' | 'approved' | 'rejected';
  review_signals: ReviewSignal[];
  approved_with_signals: ReviewSignal[];
  edited_by_human: boolean;
  created_at: string;
}
