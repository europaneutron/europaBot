import { createServerClient } from '@supabase/ssr';
import type { NextRequest } from 'next/server';
import { adminRepository } from '@/data/repositories/admin.repository';

export interface AuthenticatedAdmin {
  id: string;
  email?: string;
}

export async function getAuthenticatedAdmin(
  request: NextRequest
): Promise<AuthenticatedAdmin | null> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll() {},
      },
    }
  );

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  return await adminRepository.isActive(user.id)
    ? { id: user.id, email: user.email }
    : null;
}
