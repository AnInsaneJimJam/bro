import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isDemoMode } from '@/lib/auth';
import { jsonError } from '@/lib/http';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const input = z.object({
  action: z.enum(['sign_in', 'sign_up']),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  try {
    if (isDemoMode())
      return NextResponse.json(
        { error: 'Password authentication is disabled in demo mode.' },
        { status: 409 }
      );
    const body = input.parse(await request.json()),
      email = body.email.toLowerCase();
    enforceRateLimit(`password-auth:${email}`, 8, 15 * 60_000);
    const supabase = await createSupabaseServerClient();
    if (body.action === 'sign_in') {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: body.password,
      });
      if (error)
        throw Object.assign(new Error('Invalid email or password.'), {
          status: 400,
        });
      if (!data.session)
        throw Object.assign(new Error('Supabase did not create a session.'), {
          status: 502,
        });
      return NextResponse.json({ authenticated: true, next: '/onboarding' });
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password: body.password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback?next=/onboarding`,
      },
    });
    if (error) throw Object.assign(new Error(error.message), { status: 400 });
    return NextResponse.json(
      data.session
        ? { authenticated: true, next: '/onboarding' }
        : {
            authenticated: false,
            message: 'Check your email to confirm your Bro account.',
          }
    );
  } catch (error) {
    return jsonError(error);
  }
}
