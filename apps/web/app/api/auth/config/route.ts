import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey)
    return NextResponse.json(
      { error: 'Supabase is not configured on the web service.' },
      { status: 503, headers: { 'cache-control': 'no-store' } }
    );
  return NextResponse.json(
    { url, anonKey },
    { headers: { 'cache-control': 'no-store' } }
  );
}
