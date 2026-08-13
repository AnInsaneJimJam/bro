import { describe, expect, it } from 'vitest';
import { createPkce, signOAuthState, verifyOAuthState } from './oauth';
const secret = 'a-secure-test-secret-that-is-long-enough';
const payload = {
  userId: 'user-1',
  provider: 'youtube' as const,
  nonce: 'nonce',
  returnTo: '/connections',
  issuedAt: Date.now(),
};
describe('oauth', () => {
  it('creates S256 PKCE', () => {
    const value = createPkce();
    expect(value.verifier.length).toBeGreaterThan(43);
    expect(value.challenge).not.toBe(value.verifier);
  });
  it('round trips state', () =>
    expect(
      verifyOAuthState(signOAuthState(payload, secret), secret, {
        userId: 'user-1',
        provider: 'youtube',
      })
    ).toMatchObject(payload));
  it('rejects mismatch', () =>
    expect(() =>
      verifyOAuthState(signOAuthState(payload, secret), secret, {
        userId: 'other',
        provider: 'youtube',
      })
    ).toThrow(/mismatch/));
  it('rejects unsafe return paths', () =>
    expect(() =>
      verifyOAuthState(
        signOAuthState({ ...payload, returnTo: '//evil.test' }, secret),
        secret,
        { userId: 'user-1', provider: 'youtube' }
      )
    ).toThrow(/Unsafe/));
});
