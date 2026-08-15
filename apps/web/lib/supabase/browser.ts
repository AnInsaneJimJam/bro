import { createBrowserClient } from '@supabase/ssr';

export function createSupabaseBrowserClient(config?: {
  url?: string;
  anonKey?: string;
}) {
  const url = config?.url || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = config?.anonKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase is not configured');
  return createBrowserClient(url, key);
}
