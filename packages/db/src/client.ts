import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

export function getDatabaseSslOptions(
  certificatePath = process.env.DATABASE_SSL_CA_PATH
) {
  if (!certificatePath) return undefined;
  return {
    ca: readFileSync(certificatePath, 'utf8'),
    rejectUnauthorized: true,
  };
}

export function databaseUrlWithExternalSslOptions(
  databaseUrl: string,
  externalSslOptions: boolean
) {
  if (!externalSslOptions) return databaseUrl;
  const parsed = new URL(databaseUrl);
  parsed.searchParams.delete('sslmode');
  parsed.searchParams.delete('uselibpqcompat');
  return parsed.toString();
}

export function createDatabase(url = process.env.DATABASE_URL) {
  if (!url)
    throw Object.assign(new Error('DATABASE_URL is not configured'), {
      status: 503,
    });
  const ssl = getDatabaseSslOptions();
  // The web process creates short-lived database handles for each route. A
  // large per-request pool can exhaust Supabase's session pooler when the
  // dashboard runs several reads at once, so keep this deliberately small.
  const configuredMax = Number(process.env.DATABASE_POOL_MAX || 4);
  const max = Number.isFinite(configuredMax)
    ? Math.max(1, Math.min(10, Math.floor(configuredMax)))
    : 4;
  const configuredConnectTimeout = Number(
    process.env.DATABASE_CONNECT_TIMEOUT_SECONDS || 10
  );
  const connectTimeout = Number.isFinite(configuredConnectTimeout)
    ? Math.max(3, Math.min(60, Math.floor(configuredConnectTimeout)))
    : 10;
  const client = postgres(
    databaseUrlWithExternalSslOptions(url, Boolean(ssl)),
    {
      max,
      prepare: false,
      connect_timeout: connectTimeout,
      idle_timeout: 20,
      ...(ssl ? { ssl } : {}),
    }
  );
  return { db: drizzle(client, { schema }), close: () => client.end() };
}
