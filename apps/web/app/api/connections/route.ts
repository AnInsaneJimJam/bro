import { NextResponse } from 'next/server';
import { z } from 'zod';
import { decryptSecret, providers } from '@bro/core';
import {
  createDatabase,
  deleteConnection,
  getConnectionSecrets,
  listConnections,
} from '@bro/db';
import { revokeProviderToken } from '@bro/integrations';
import { requireUser } from '@/lib/auth';
import { jsonError } from '@/lib/http';
import { missingProviderScopes, type OAuthProvider } from '@/lib/oauth-config';
export async function GET() {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    if (user.demo)
      return NextResponse.json([
        {
          provider: 'youtube',
          accountName: '@creatorbro',
          status: 'healthy',
          demo: true,
        },
        {
          provider: 'instagram',
          accountName: '@creatorbro_in',
          status: 'healthy',
          demo: true,
        },
        {
          provider: 'reddit',
          accountName: 'u/creatorbro_in',
          status: 'demo',
          demo: true,
        },
      ]);
    const database = createDatabase();
    close = database.close;
    const rows = await listConnections(database.db, user.id);
    return NextResponse.json(
      rows.map((row) => ({
        ...row,
        needsReauthorization:
          missingProviderScopes(row.provider as OAuthProvider, row.scopes)
            .length > 0,
      }))
    );
  } catch (e) {
    return jsonError(e);
  } finally {
    await close?.();
  }
}
export async function DELETE(req: Request) {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    const { provider } = z
      .object({ provider: providers })
      .parse(await req.json());
    if (user.demo)
      return NextResponse.json(
        {
          error:
            'Demo connections cannot be revoked because no live token exists.',
        },
        { status: 409 }
      );
    const keyRaw = process.env.TOKEN_ENCRYPTION_KEY;
    if (!keyRaw)
      throw Object.assign(new Error('Token encryption is not configured'), {
        status: 503,
      });
    const database = createDatabase();
    close = database.close;
    const stored = await getConnectionSecrets(database.db, user.id, provider);
    if (!stored)
      throw Object.assign(new Error('Connection not found'), { status: 404 });
    const token = decryptSecret(
      stored.accessToken,
      Buffer.from(keyRaw, 'base64')
    );
    await revokeProviderToken(provider, token, {
      clientId:
        provider === 'reddit' ? process.env.REDDIT_CLIENT_ID : undefined,
      clientSecret:
        provider === 'reddit' ? process.env.REDDIT_CLIENT_SECRET : undefined,
      apiVersion: process.env.INSTAGRAM_API_VERSION,
      userAgent: process.env.REDDIT_USER_AGENT,
    });
    await deleteConnection(database.db, user.id, provider);
    return NextResponse.json({ disconnected: true, provider });
  } catch (e) {
    return jsonError(e);
  } finally {
    await close?.();
  }
}
