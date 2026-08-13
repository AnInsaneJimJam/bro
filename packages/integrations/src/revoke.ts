import type { HttpClient } from './http';
export async function revokeProviderToken(
  provider: 'youtube' | 'instagram' | 'reddit',
  token: string,
  input: {
    clientId?: string;
    clientSecret?: string;
    apiVersion?: string;
    userAgent?: string;
  } = {},
  http: HttpClient = fetch
) {
  let response: Response;
  if (provider === 'youtube')
    response = await http('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    });
  else if (provider === 'instagram')
    response = await http(
      `https://graph.facebook.com/${input.apiVersion || 'v24.0'}/me/permissions?access_token=${encodeURIComponent(token)}`,
      { method: 'DELETE' }
    );
  else {
    if (!input.clientId || !input.clientSecret)
      throw new Error('Reddit client credentials are required for revocation');
    response = await http('https://www.reddit.com/api/v1/revoke_token', {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${input.clientId}:${input.clientSecret}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': input.userAgent || 'bro-mvp',
      },
      body: new URLSearchParams({ token, token_type_hint: 'access_token' }),
    });
  }
  if (!response.ok)
    throw Object.assign(
      new Error(`${provider} token revocation failed (${response.status})`),
      { status: 502 }
    );
}
