export type BrandTone = 'friendly' | 'direct' | 'formal';

export interface ClientBrandConfig {
  root_scope_id: string;
  business_name: string | null;
  project_singular: string;
  project_plural: string;
  tone: BrandTone;
  is_configured: boolean;
  use_composed_greeting: boolean;
  created_at: string;
  updated_at: string;
}

export type OnboardingStatus = 'in_progress' | 'completed' | 'abandoned';

export interface OnboardingAnswers {
  manual_setup?: boolean;
  vocabulary?: boolean;
  /** El primero de los confirmados. Para nombrarlos todos, `project_names`. */
  project_name?: string;
  /** Todos los desarrollos confirmados, en el orden en que se confirmaron. */
  project_names?: string[];
  /**
   * Alias del proyecto en el alta manual; los nombres de los desarrollos
   * hermanos cuando la estructura sale del material. Dos significados en la
   * misma clave: por eso quien quiera la lista de desarrollos lee
   * `project_names`.
   */
  aliases?: string[];
  visit_flow?: 'decided' | 'guided' | 'unsure';
  part_names?: string[];
  goal_confirmed?: boolean;
  material_received?: boolean;
  tone?: BrandTone;
  business_name?: string;
  greeting_choice?: 'keep' | 'composed';
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
