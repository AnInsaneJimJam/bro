import { eq } from 'drizzle-orm';
import { decryptSecret, encryptSecret } from '@bro/core';
import { platformConnections, type createDatabase } from '@bro/db';
import {
  refreshInstagramAccessToken,
  refreshProviderAccessToken,
} from '@bro/integrations';

export async function accessToken(
  database: ReturnType<typeof createDatabase>,
  row: typeof platformConnections.$inferSelect,
  key: Buffer
) {
  if (!row.expiresAt || row.expiresAt.getTime() > Date.now() + 5 * 60_000)
    return decryptSecret(
      row.encryptedAccessToken as Parameters<typeof decryptSecret>[0],
      key
    );
  if (row.provider === 'instagram') {
    try {
      const refreshed = await refreshInstagramAccessToken(
        decryptSecret(
          row.encryptedAccessToken as Parameters<typeof decryptSecret>[0],
          key
        ),
        row.scopes || []
      );
      return persistRefreshedToken(database, row, key, refreshed);
    } catch (error) {
      await markReconnectRequired(database, row, error);
      throw error;
    }
  }
  if (row.provider !== 'youtube' && row.provider !== 'reddit')
    throw new Error('Unsupported token provider');
  if (!row.encryptedRefreshToken) {
    await database.db
      .update(platformConnections)
      .set({ status: 'reconnect_required', updatedAt: new Date() })
      .where(eq(platformConnections.id, row.id));
    throw Object.assign(
      new Error(
        `${row.provider} refresh access is unavailable. Reconnect the account.`
      ),
      { code: 'TOKEN_RECONNECT_REQUIRED' }
    );
  }
  try {
    const refreshed = await refreshProviderAccessToken(row.provider, {
      refreshToken: decryptSecret(
        row.encryptedRefreshToken as Parameters<typeof decryptSecret>[0],
        key
      ),
      clientId: required(
        row.provider === 'youtube' ? 'GOOGLE_CLIENT_ID' : 'REDDIT_CLIENT_ID'
      ),
      clientSecret: required(
        row.provider === 'youtube'
          ? 'GOOGLE_CLIENT_SECRET'
          : 'REDDIT_CLIENT_SECRET'
      ),
      scopes: row.scopes || [],
      userAgent: process.env.REDDIT_USER_AGENT,
    });
    return persistRefreshedToken(database, row, key, refreshed);
  } catch (error) {
    await markReconnectRequired(database, row, error);
    throw error;
  }
}

async function markReconnectRequired(
  database: ReturnType<typeof createDatabase>,
  row: typeof platformConnections.$inferSelect,
  error: unknown
) {
  if (!isAuthorizationFailure(error)) return;
  await database.db
    .update(platformConnections)
    .set({
      status: 'reconnect_required',
      metadata: {
        ...((row.metadata || {}) as Record<string, unknown>),
        lastError:
          error instanceof Error
            ? error.message
            : 'Provider authorization expired',
      },
      updatedAt: new Date(),
    })
    .where(eq(platformConnections.id, row.id));
}

export function isAuthorizationFailure(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const value = error as {
    code?: unknown;
    httpStatus?: unknown;
    status?: unknown;
  };
  return (
    value.code === 'PROVIDER_AUTH_EXPIRED' ||
    value.httpStatus === 401 ||
    value.status === 401
  );
}

async function persistRefreshedToken(
  database: ReturnType<typeof createDatabase>,
  row: typeof platformConnections.$inferSelect,
  key: Buffer,
  refreshed: Awaited<ReturnType<typeof refreshProviderAccessToken>>
) {
  const encrypted = encryptSecret(
    refreshed.accessToken,
    key,
    Number(process.env.TOKEN_ENCRYPTION_KEY_VERSION || 1)
  );
  await database.db
    .update(platformConnections)
    .set({
      encryptedAccessToken: encrypted,
      expiresAt: refreshed.expiresAt,
      scopes: refreshed.scopes,
      status: 'healthy',
      updatedAt: new Date(),
    })
    .where(eq(platformConnections.id, row.id));
  row.encryptedAccessToken = encrypted;
  row.expiresAt = refreshed.expiresAt || null;
  row.scopes = refreshed.scopes;
  return refreshed.accessToken;
}
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
