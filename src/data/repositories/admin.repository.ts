import { supabaseServer } from '@/services/supabase/server-client';

export class AdminRepository {
  async isActive(adminId: string): Promise<boolean> {
    const { data, error } = await supabaseServer
      .from('admin_users')
      .select('id')
      .eq('id', adminId)
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }
}

export const adminRepository = new AdminRepository();
