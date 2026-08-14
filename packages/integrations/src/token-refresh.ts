import type { HttpClient } from './http';
import { providerJson } from './http';
import type { OAuthTokens } from './token-exchange';

export async function refreshProviderAccessToken(
  provider: 'youtube' | 'reddit',
  input: {
    refreshToken: string;
    clientId: string;
    clientSecret: string;
    scopes: string[];
    userAgent?: string;
  },
  http: HttpClient = fetch
): Promise<OAuthTokens> {
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
  };
  if (provider === 'reddit') {
    headers.authorization = `Basic ${Buffer.from(`${input.clientId}:${input.clientSecret}`).toString('base64')}`;
    headers['user-agent'] = input.userAgent || 'bro-mvp';
  }
  const data = await providerJson<{
    access_token: string;
    expires_in?: number;
    scope?: string;
  }>(
    provider,
    http,
    provider === 'youtube'
      ? 'https://oauth2.googleapis.com/token'
      : 'https://www.reddit.com/api/v1/access_token',
    {
      method: 'POST',
      headers,
      body: new URLSearchParams(
        provider === 'youtube'
          ? {
              client_id: input.clientId,
              client_secret: input.clientSecret,
              refresh_token: input.refreshToken,
              grant_type: 'refresh_token',
            }
          : { grant_type: 'refresh_token', refresh_token: input.refreshToken }
      ),
    }
  );
  return {
    accessToken: data.access_token,
    refreshToken: input.refreshToken,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined,
    scopes: data.scope?.split(' ') || input.scopes,
  };
}

export async function refreshInstagramAccessToken(
  accessToken: string,
  scopes: string[] = [],
  http: HttpClient = fetch
): Promise<OAuthTokens> {
  const data = await providerJson<{
    access_token: string;
    expires_in?: number;
  }>(
    'instagram',
    http,
    `https://graph.instagram.com/refresh_access_token?${new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: accessToken })}`
  );
  return {
    accessToken: data.access_token,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined,
    scopes,
  };
}
