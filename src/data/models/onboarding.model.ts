export type BrandTone = 'friendly' | 'direct' | 'formal';

export interface ClientBrandConfig {
  root_scope_id: string;
  project_singular: string;
  project_plural: string;
  tone: BrandTone;
  is_configured: boolean;
  created_at: string;
  updated_at: string;
}

export type OnboardingStatus = 'in_progress' | 'completed' | 'abandoned';

export interface OnboardingAnswers {
  vocabulary?: boolean;
  project_name?: string;
  aliases?: string[];
  visit_flow?: 'decided' | 'guided' | 'unsure';
  part_names?: string[];
  goal_confirmed?: boolean;
  material_received?: boolean;
  tone?: BrandTone;
}

export interface OnboardingSession {
  id: string;
  admin_id: string;
  status: OnboardingStatus;
  current_step: number;
  answers: OnboardingAnswers;
  scope_id: string | null;
  run_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}
