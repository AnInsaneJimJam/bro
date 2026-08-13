import { createSupabaseServerClient } from './supabase/server';

export async function requireUser() {
  if (isDemoMode())
    return { id: '00000000-0000-4000-8000-000000000001', demo: true };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new UnauthorizedError();
  return { id: data.user.id, demo: false };
}
export function isDemoMode() {
  return (
    process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ||
    (process.env.NODE_ENV !== 'production' &&
      (!process.env.NEXT_PUBLIC_SUPABASE_URL ||
        !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY))
  );
}
export class UnauthorizedError extends Error {
  status = 401;
  constructor() {
    super('Authentication required');
  }
}
