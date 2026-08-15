export interface Scope {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  scope_type: string;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type ScopedRow = {
  scope_id: string | null;
};
