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
  const client = postgres(url, {
    max: 10,
    prepare: false,
    ...(ssl ? { ssl } : {}),
  });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}
