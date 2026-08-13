import { describe, it, expect } from 'vitest';
import {
  scoreTrend,
  encryptSecret,
  decryptSecret,
  redactSecrets,
  assertPublishTransition,
} from './index';
describe('core', () => {
  it('scores trends deterministically', () =>
    expect(
      scoreTrend({
        recency: 1,
        velocity: 0.5,
        crossSource: 0.5,
        niche: 1,
        country: 1,
      })
    ).toBe(83));
  it('encrypts tokens', () => {
    const key = Buffer.alloc(32, 7),
      value = encryptSecret('token', key);
    expect(value.ciphertext).not.toContain('token');
    expect(decryptSecret(value, key)).toBe('token');
  });
  it('redacts secrets', () =>
    expect(redactSecrets({ accessToken: 'x', ok: true })).toEqual({
      accessToken: '[REDACTED]',
      ok: true,
    }));
  it('rejects invalid transitions', () =>
    expect(() => assertPublishTransition('published', 'processing')).toThrow());
});
