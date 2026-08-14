import { describe, expect, it } from 'vitest';
import { isAuthorizationFailure } from './provider-token';

describe('provider token authorization failures', () => {
  it('recognizes provider auth expiry and HTTP 401 responses', () => {
    expect(isAuthorizationFailure({ code: 'PROVIDER_AUTH_EXPIRED' })).toBe(
      true
    );
    expect(isAuthorizationFailure({ httpStatus: 401 })).toBe(true);
    expect(isAuthorizationFailure({ status: 401 })).toBe(true);
  });

  it('does not turn transient or quota errors into reconnect prompts', () => {
    expect(isAuthorizationFailure({ code: 'PROVIDER_RATE_LIMITED' })).toBe(
      false
    );
    expect(isAuthorizationFailure({ httpStatus: 503 })).toBe(false);
    expect(isAuthorizationFailure(new Error('temporary outage'))).toBe(false);
  });
});
