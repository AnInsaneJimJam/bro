import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { jsonError } from '@/lib/http';
export async function GET(req: Request) {
  try {
    const url = new URL(req.url),
      code = url.searchParams.get('code'),
      next = url.searchParams.get('next') || '/';
    if (!code) throw new Error('Authentication code is missing');
    if (!next.startsWith('/') || next.startsWith('//'))
      throw new Error('Unsafe authentication return path');
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw Object.assign(new Error(error.message), { status: 400 });
    return NextResponse.redirect(
      new URL(next, process.env.NEXT_PUBLIC_APP_URL)
    );
  } catch (e) {
    return jsonError(e);
  }
}
