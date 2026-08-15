import { NextResponse } from 'next/server';

function isDatabaseQueryError(value: unknown) {
  const message =
    value && typeof value === 'object' && 'message' in value
      ? String(value.message)
      : '';
  return (
    /^Failed query:/i.test(message) ||
    /database|postgres|drizzle/i.test(message)
  );
}

function logError(error: unknown) {
  const value = error as {
    name?: string;
    code?: string;
    status?: number;
    cause?: { name?: string; code?: string };
  };
  console.error(
    JSON.stringify({
      level: 'error',
      event: 'api_request_error',
      name: value?.name,
      code: value?.code,
      status: value?.status,
      causeName: value?.cause?.name,
      causeCode: value?.cause?.code,
    })
  );
}

export function jsonError(error: unknown) {
  const value = error as { message?: string; status?: number; code?: string };
  logError(error);
  if (isDatabaseQueryError(error))
    return NextResponse.json(
      {
        error: 'Bro could not reach the workspace database. Please try again.',
        code: value.code || 'DATABASE_ERROR',
      },
      { status: 503 }
    );
  return NextResponse.json(
    { error: value.message || 'Request failed', code: value.code },
    { status: value.status || 400 }
  );
}
