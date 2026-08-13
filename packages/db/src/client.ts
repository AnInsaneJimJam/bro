import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
export function createDatabase(url = process.env.DATABASE_URL) {
  if (!url)
    throw Object.assign(new Error('DATABASE_URL is not configured'), {
      status: 503,
    });
  const client = postgres(url, { max: 10, prepare: false });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}
