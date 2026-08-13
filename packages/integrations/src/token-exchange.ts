import { providerJson, type HttpClient } from './http';
export type OAuthTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes: string[];
};
export async function exchangeAuthorizationCode(
  provider: 'youtube' | 'instagram' | 'reddit',
  input: {
    code: string;
    verifier: string;
    redirectUri: string;
    clientId: string;
    clientSecret: string;
    scopes: string[];
    apiVersion?: string;
  },
  http: HttpClient = fetch
): Promise<OAuthTokens> {
  if (provider === 'youtube') {
    const data = await providerJson<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    }>('youtube', http, 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: input.code,
        client_id: input.clientId,
        client_secret: input.clientSecret,
        redirect_uri: input.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: input.verifier,
      }),
    });
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : undefined,
      scopes: data.scope?.split(' ') || input.scopes,
    };
  }
  if (provider === 'instagram') {
    const data = await providerJson<{
      access_token: string;
      expires_in?: number;
    }>(
      'instagram',
      http,
      `https://graph.facebook.com/${input.apiVersion || 'v24.0'}/oauth/access_token?${new URLSearchParams({ client_id: input.clientId, client_secret: input.clientSecret, redirect_uri: input.redirectUri, code: input.code, code_verifier: input.verifier })}`
    );
    return {
      accessToken: data.access_token,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : undefined,
      scopes: input.scopes,
    };
  }
  const credentials = Buffer.from(
    `${input.clientId}:${input.clientSecret}`
  ).toString('base64');
  const data = await providerJson<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  }>('reddit', http, 'https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      authorization: `Basic ${credentials}`,
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': process.env.REDDIT_USER_AGENT || 'bro-mvp',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.verifier,
    }),
  });
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined,
    scopes: data.scope?.split(' ') || input.scopes,
  };
}
