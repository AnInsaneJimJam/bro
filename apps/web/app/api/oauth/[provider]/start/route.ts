import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createPkce, signOAuthState } from '@bro/integrations';
import { requireUser } from '@/lib/auth';
import { oauthAuthorizationUrl, type OAuthProvider } from '@/lib/oauth-config';
import { jsonError } from '@/lib/http';
const supported = new Set(['youtube', 'instagram', 'reddit']);
export async function GET(
  req: Request,
  context: { params: Promise<{ provider: string }> }
) {
  try {
    const user = await requireUser();
    const { provider } = await context.params;
    if (!supported.has(provider))
      throw Object.assign(new Error('Unsupported OAuth provider'), {
        status: 404,
      });
    if (user.demo)
      return NextResponse.json(
        {
          mode: 'demo',
          error:
            'Live OAuth is unavailable in demo mode. Configure provider credentials and disable demo mode.',
        },
        { status: 409 }
      );
    const secret = process.env.OAUTH_STATE_SECRET;
    if (!secret)
      throw Object.assign(new Error('OAUTH_STATE_SECRET is not configured'), {
        status: 503,
      });
    const pkce = createPkce(),
      nonce = crypto.randomUUID();
    const state = signOAuthState(
      {
        userId: user.id,
        provider: provider as OAuthProvider,
        nonce,
        returnTo: '/connections',
        issuedAt: Date.now(),
      },
      secret
    );
    const jar = await cookies();
    jar.set(
      `bro_oauth_${provider}`,
      JSON.stringify({ verifier: pkce.verifier, nonce, userId: user.id }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 600,
      }
    );
    return NextResponse.redirect(
      oauthAuthorizationUrl(provider as OAuthProvider, {
        state,
        challenge: pkce.challenge,
      })
    );
  } catch (e) {
    return jsonError(e);
  }
}
