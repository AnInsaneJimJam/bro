import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

export type OAuthState = {
  userId: string;
  provider: 'youtube' | 'instagram' | 'reddit';
  nonce: string;
  returnTo: string;
  issuedAt: number;
};
const encode = (value: Buffer | string) =>
  Buffer.from(value).toString('base64url');
export function createPkce() {
  const verifier = encode(randomBytes(48));
  return {
    verifier,
    challenge: encode(createHash('sha256').update(verifier).digest()),
    method: 'S256' as const,
  };
}
export function signOAuthState(payload: OAuthState, secret: string) {
  if (secret.length < 32)
    throw new Error('OAuth state secret must be at least 32 characters');
  const body = encode(JSON.stringify(payload));
  const signature = encode(createHmac('sha256', secret).update(body).digest());
  return `${body}.${signature}`;
}
export function verifyOAuthState(
  state: string,
  secret: string,
  expected: { userId: string; provider: OAuthState['provider'] },
  maxAgeMs = 10 * 60_000
) {
  const [body, signature] = state.split('.');
  if (!body || !signature) throw new Error('Invalid OAuth state');
  const expectedSignature = encode(
    createHmac('sha256', secret).update(body).digest()
  );
  const a = Buffer.from(signature),
    b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !timingSafeEqual(a, b))
    throw new Error('OAuth state mismatch');
  const payload = JSON.parse(
    Buffer.from(body, 'base64url').toString()
  ) as OAuthState;
  if (
    payload.userId !== expected.userId ||
    payload.provider !== expected.provider
  )
    throw new Error('OAuth state mismatch');
  if (
    Date.now() - payload.issuedAt > maxAgeMs ||
    payload.issuedAt > Date.now() + 30_000
  )
    throw new Error('OAuth state expired');
  if (!payload.returnTo.startsWith('/') || payload.returnTo.startsWith('//'))
    throw new Error('Unsafe OAuth return path');
  return payload;
}
