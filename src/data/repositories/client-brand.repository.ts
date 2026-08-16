import { ROOT_SCOPE_ID } from '@/data/repositories/scope.repository';
import type { BrandTone, ClientBrandConfig } from '@/data/models/onboarding.model';
import { supabaseServer } from '@/services/supabase/server-client';

export class ClientBrandRepository {
  async get(): Promise<ClientBrandConfig> {
    const { data, error } = await supabaseServer
      .from('client_brand_config')
      .select('*')
      .eq('root_scope_id', ROOT_SCOPE_ID)
      .single();
    if (error) throw error;
    return data as ClientBrandConfig;
  }

  async update(values: {
    projectSingular?: string;
    projectPlural?: string;
    tone?: BrandTone;
    configured?: boolean;
  }): Promise<ClientBrandConfig> {
    const row: Record<string, unknown> = {};
    if (values.projectSingular !== undefined) row.project_singular = values.projectSingular;
    if (values.projectPlural !== undefined) row.project_plural = values.projectPlural;
    if (values.tone !== undefined) row.tone = values.tone;
    if (values.configured !== undefined) row.is_configured = values.configured;

    const { data, error } = await supabaseServer
      .from('client_brand_config')
      .update(row)
      .eq('root_scope_id', ROOT_SCOPE_ID)
      .select('*')
      .single();
    if (error) throw error;
    return data as ClientBrandConfig;
  }
}

export const clientBrandRepository = new ClientBrandRepository();
