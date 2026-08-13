import { NextResponse } from 'next/server';
export function jsonError(error: unknown) {
  const value = error as { message?: string; status?: number; code?: string };
  return NextResponse.json(
    { error: value.message || 'Request failed', code: value.code },
    { status: value.status || 400 }
  );
}
