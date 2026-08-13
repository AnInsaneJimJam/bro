import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { jsonError } from '@/lib/http';
import { isDemoMode } from '@/lib/auth';
const input = z.object({ email: z.string().email() });
export async function POST(req: Request) {
  try {
    if (isDemoMode())
      return NextResponse.json(
        {
          error:
            'Magic links are disabled in demo mode. Use the labeled demo entry.',
        },
        { status: 409 }
      );
    const { email } = input.parse(await req.json());
    enforceRateLimit(`magic:${email.toLowerCase()}`, 5, 15 * 60_000);
    const supabase = await createSupabaseServerClient();
    const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback?next=/onboarding`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
    });
    if (error) throw Object.assign(new Error(error.message), { status: 400 });
    return NextResponse.json({
      message: 'Check your email for a secure sign-in link.',
    });
  } catch (e) {
    return jsonError(e);
  }
}
