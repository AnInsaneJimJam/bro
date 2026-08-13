export type OAuthProvider = 'youtube' | 'instagram' | 'reddit';
export function oauthAuthorizationUrl(
  provider: OAuthProvider,
  input: { state: string; challenge: string }
) {
  if (provider === 'youtube') {
    const clientId = requireEnv('GOOGLE_CLIENT_ID'),
      redirectUri = requireAbsoluteUrl('GOOGLE_REDIRECT_URI'),
      scopes = requireEnv('GOOGLE_SCOPES');
    return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: scopes, access_type: 'offline', prompt: 'consent', state: input.state, code_challenge: input.challenge, code_challenge_method: 'S256' })}`;
  }
  if (provider === 'instagram') {
    const clientId = requireEnv('META_APP_ID'),
      redirectUri = requireAbsoluteUrl('META_REDIRECT_URI'),
      scopes = requireEnv('META_SCOPES');
    return `https://www.facebook.com/${process.env.META_API_VERSION || 'v24.0'}/dialog/oauth?${new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: scopes, state: input.state, code_challenge: input.challenge, code_challenge_method: 'S256' })}`;
  }
  if (process.env.REDDIT_INTEGRATION_ENABLED !== 'true')
    throw Object.assign(
      new Error('Reddit OAuth is disabled pending approved API access.'),
      { status: 503 }
    );
  const clientId = requireEnv('REDDIT_CLIENT_ID'),
    redirectUri = requireAbsoluteUrl('REDDIT_REDIRECT_URI');
  return `https://www.reddit.com/api/v1/authorize?${new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', duration: 'permanent', scope: 'identity history read', state: input.state, code_challenge: input.challenge, code_challenge_method: 'S256' })}`;
}
function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value)
    throw Object.assign(new Error(`${name} is not configured`), {
      status: 503,
    });
  return value;
}
function requireAbsoluteUrl(name: string) {
  const value = requireEnv(name);
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw 0;
    return url.toString();
  } catch {
    throw Object.assign(
      new Error(
        `${name} must be an absolute HTTPS URL (localhost may use HTTP)`
      ),
      { status: 503 }
    );
  }
}
