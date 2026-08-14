import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  InstagramAdapter,
  RedditAdapter,
  YouTubeAdapter,
  exchangeAuthorizationCode,
  verifyOAuthState,
} from '@bro/integrations';
import { encryptSecret } from '@bro/core';
import { createDatabase, upsertConnection } from '@bro/db';
import { requireUser } from '@/lib/auth';
import { jsonError } from '@/lib/http';
import type { OAuthProvider } from '@/lib/oauth-config';
const supported = new Set(['youtube', 'instagram', 'reddit']);
export async function GET(
  req: Request,
  context: { params: Promise<{ provider: string }> }
) {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    const { provider } = await context.params;
    if (!supported.has(provider))
      throw Object.assign(new Error('Unsupported OAuth provider'), {
        status: 404,
      });
    const typed = provider as OAuthProvider,
      url = new URL(req.url),
      state = url.searchParams.get('state'),
      code = url.searchParams.get('code');
    if (!state || !code)
      throw new Error('OAuth callback is missing code or state');
    const secret = process.env.OAUTH_STATE_SECRET;
    if (!secret)
      throw Object.assign(
        new Error('OAuth state validation is not configured'),
        { status: 503 }
      );
    const payload = verifyOAuthState(state, secret, {
      userId: user.id,
      provider: typed,
    });
    const jar = await cookies(),
      raw = jar.get(`bro_oauth_${provider}`)?.value;
    if (!raw) throw new Error('OAuth verifier cookie is missing or expired');
    const saved = JSON.parse(raw) as {
      verifier: string;
      nonce: string;
      userId: string;
    };
    if (saved.nonce !== payload.nonce || saved.userId !== user.id)
      throw new Error('OAuth verifier mismatch');
    const config = providerConfig(typed),
      tokens = await exchangeAuthorizationCode(typed, {
        code,
        verifier: saved.verifier,
        ...config,
      });
    const account =
      typed === 'youtube'
        ? await new YouTubeAdapter(async () => tokens.accessToken).connect()
        : typed === 'instagram'
          ? await new InstagramAdapter(
              async () => tokens.accessToken,
              process.env.INSTAGRAM_API_VERSION || 'v24.0'
            ).connect()
          : await new RedditAdapter(
              async () => tokens.accessToken,
              process.env.REDDIT_INTEGRATION_ENABLED === 'true',
              process.env.REDDIT_USER_AGENT || 'bro-mvp'
            ).connect();
    const keyRaw = process.env.TOKEN_ENCRYPTION_KEY;
    if (!keyRaw)
      throw Object.assign(new Error('TOKEN_ENCRYPTION_KEY is not configured'), {
        status: 503,
      });
    const key = Buffer.from(keyRaw, 'base64');
    const database = createDatabase();
    close = database.close;
    await upsertConnection(database.db, {
      userId: user.id,
      provider: typed,
      accountId: account.accountId,
      accountName: account.accountName,
      accessToken: encryptSecret(
        tokens.accessToken,
        key,
        Number(process.env.TOKEN_ENCRYPTION_KEY_VERSION || 1)
      ),
      refreshToken: tokens.refreshToken
        ? encryptSecret(
            tokens.refreshToken,
            key,
            Number(process.env.TOKEN_ENCRYPTION_KEY_VERSION || 1)
          )
        : undefined,
      scopes: tokens.scopes,
      expiresAt: tokens.expiresAt,
    });
    jar.delete(`bro_oauth_${provider}`);
    return NextResponse.redirect(
      new URL(payload.returnTo, process.env.NEXT_PUBLIC_APP_URL)
    );
  } catch (e) {
    const safeMessage =
      e instanceof Error ? e.message.slice(0, 240) : 'OAuth connection failed';
    if (process.env.NEXT_PUBLIC_APP_URL) {
      const fallback = new URL(
        '/onboarding?step=connections',
        process.env.NEXT_PUBLIC_APP_URL
      );
      fallback.searchParams.set('oauth_error', safeMessage);
      return NextResponse.redirect(fallback);
    }
    return jsonError(e);
  } finally {
    await close?.();
  }
}
function providerConfig(provider: OAuthProvider) {
  if (provider === 'youtube')
    return {
      redirectUri: required('GOOGLE_REDIRECT_URI'),
      clientId: required('GOOGLE_CLIENT_ID'),
      clientSecret: required('GOOGLE_CLIENT_SECRET'),
      scopes: required('GOOGLE_SCOPES').split(' '),
    };
  if (provider === 'instagram')
    return {
      redirectUri: required('INSTAGRAM_REDIRECT_URI'),
      clientId: required('INSTAGRAM_APP_ID'),
      clientSecret: required('INSTAGRAM_APP_SECRET'),
      scopes: required('INSTAGRAM_SCOPES').split(','),
      apiVersion: process.env.INSTAGRAM_API_VERSION,
    };
  return {
    redirectUri: required('REDDIT_REDIRECT_URI'),
    clientId: required('REDDIT_CLIENT_ID'),
    clientSecret: required('REDDIT_CLIENT_SECRET'),
    scopes: ['identity', 'history', 'read'],
  };
}
function required(name: string) {
  const value = process.env[name];
  if (!value)
    throw Object.assign(new Error(`${name} is not configured`), {
      status: 503,
    });
  return value;
}
