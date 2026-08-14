import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { jsonError } from '@/lib/http';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST() {
  try {
    const user = await requireUser();
    if (user.demo)
      return NextResponse.json(
        {
          error: 'The labeled demo does not create an authentication session.',
        },
        { status: 409 }
      );
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw Object.assign(new Error(error.message), { status: 400 });
    return NextResponse.json({ signedOut: true });
  } catch (error) {
    return jsonError(error);
  }
}
