import { and, eq } from 'drizzle-orm';
import { platformConnections } from './schema';
import type { EncryptedSecret, Provider } from '@bro/core';
import type { ReturnTypeDatabase } from './types';
export type StoredConnection = {
  userId: string;
  provider: Provider;
  accountId: string;
  accountName: string;
  accessToken: EncryptedSecret;
  refreshToken?: EncryptedSecret;
  scopes: string[];
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
};
export async function upsertConnection(
  db: ReturnTypeDatabase,
  input: StoredConnection
) {
  const values = {
    userId: input.userId,
    provider: input.provider,
    providerAccountId: input.accountId,
    providerAccountName: input.accountName,
    encryptedAccessToken: input.accessToken,
    encryptedRefreshToken: input.refreshToken,
    scopes: input.scopes,
    expiresAt: input.expiresAt,
    status: 'healthy',
    metadata: input.metadata || {},
    updatedAt: new Date(),
  };
  const [result] = await db
    .insert(platformConnections)
    .values(values)
    .onConflictDoUpdate({
      target: [platformConnections.userId, platformConnections.provider],
      set: values,
    })
    .returning({ id: platformConnections.id });
  return result;
}
export async function deleteConnection(
  db: ReturnTypeDatabase,
  userId: string,
  provider: Provider
) {
  return db
    .delete(platformConnections)
    .where(
      and(
        eq(platformConnections.userId, userId),
        eq(platformConnections.provider, provider)
      )
    );
}
export async function listConnections(db: ReturnTypeDatabase, userId: string) {
  return db
    .select({
      id: platformConnections.id,
      provider: platformConnections.provider,
      accountId: platformConnections.providerAccountId,
      accountName: platformConnections.providerAccountName,
      status: platformConnections.status,
      scopes: platformConnections.scopes,
      expiresAt: platformConnections.expiresAt,
      lastSyncAt: platformConnections.lastSyncAt,
    })
    .from(platformConnections)
    .where(eq(platformConnections.userId, userId));
}
export async function getConnectionSecrets(
  db: ReturnTypeDatabase,
  userId: string,
  provider: Provider
) {
  const [row] = await db
    .select({
      accessToken: platformConnections.encryptedAccessToken,
      refreshToken: platformConnections.encryptedRefreshToken,
    })
    .from(platformConnections)
    .where(
      and(
        eq(platformConnections.userId, userId),
        eq(platformConnections.provider, provider)
      )
    )
    .limit(1);
  return row as
    | { accessToken: EncryptedSecret; refreshToken?: EncryptedSecret }
    | undefined;
}
