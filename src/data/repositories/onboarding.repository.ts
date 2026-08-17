import type {
  OnboardingAnswers,
  OnboardingSession,
  OnboardingStatus,
} from '@/data/models/onboarding.model';
import { supabaseServer } from '@/services/supabase/server-client';

export class OnboardingRepository {
  async getLatest(adminId: string): Promise<OnboardingSession | null> {
    const { data, error } = await supabaseServer
      .from('onboarding_sessions')
      .select('*')
      .eq('admin_id', adminId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data as OnboardingSession | null;
  }

  async getById(id: string): Promise<OnboardingSession> {
    const { data, error } = await supabaseServer
      .from('onboarding_sessions')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data as OnboardingSession;
  }

  async getByRunId(runId: string): Promise<OnboardingSession | null> {
    const { data, error } = await supabaseServer
      .from('onboarding_sessions')
      .select('*')
      .eq('run_id', runId)
      .maybeSingle();
    if (error) throw error;
    return data as OnboardingSession | null;
  }

  async create(adminId: string): Promise<OnboardingSession> {
    const { data, error } = await supabaseServer
      .from('onboarding_sessions')
      .insert({ admin_id: adminId })
      .select('*')
      .single();
    if (error) throw error;
    return data as OnboardingSession;
  }

  async abandonActive(adminId: string): Promise<void> {
    const { error } = await supabaseServer
      .from('onboarding_sessions')
      .update({ status: 'abandoned' satisfies OnboardingStatus })
      .eq('admin_id', adminId)
      .eq('status', 'in_progress');
    if (error) throw error;
  }

  async update(
    id: string,
    values: {
      step?: number;
      answers?: OnboardingAnswers;
      scopeId?: string | null;
      runId?: string | null;
      status?: OnboardingStatus;
      completedAt?: string | null;
    }
  ): Promise<OnboardingSession> {
    const row: Record<string, unknown> = {};
    if (values.step !== undefined) row.current_step = values.step;
    if (values.answers !== undefined) row.answers = values.answers;
    if (values.scopeId !== undefined) row.scope_id = values.scopeId;
    if (values.runId !== undefined) row.run_id = values.runId;
    if (values.status !== undefined) row.status = values.status;
    if (values.completedAt !== undefined) row.completed_at = values.completedAt;

    const { data, error } = await supabaseServer
      .from('onboarding_sessions')
      .update(row)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as OnboardingSession;
  }

}

export const onboardingRepository = new OnboardingRepository();
