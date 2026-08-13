import { describe, expect, it, vi } from 'vitest';
import { refreshProviderAccessToken } from './token-refresh';
describe('provider token refresh', () => {
  it("uses Google's refresh-token grant without exposing it in the URL", async () => {
    const http = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://oauth2.googleapis.com/token');
      expect(String(init?.body)).toContain('grant_type=refresh_token');
      expect(String(init?.body)).toContain('refresh_token=stored-refresh');
      return new Response(
        JSON.stringify({ access_token: 'new-access', expires_in: 3600 }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as unknown as typeof fetch;
    const result = await refreshProviderAccessToken(
      'youtube',
      {
        refreshToken: 'stored-refresh',
        clientId: 'id',
        clientSecret: 'secret',
        scopes: [],
      },
      http
    );
    expect(result.accessToken).toBe('new-access');
    expect(result.expiresAt!.getTime()).toBeGreaterThan(Date.now());
  });
  it('uses HTTP Basic auth for Reddit', async () => {
    const http = vi.fn(async (_url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).authorization).toMatch(
        /^Basic /
      );
      return new Response(
        JSON.stringify({
          access_token: 'reddit-access',
          expires_in: 3600,
          scope: 'identity read',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as unknown as typeof fetch;
    const result = await refreshProviderAccessToken(
      'reddit',
      {
        refreshToken: 'refresh',
        clientId: 'id',
        clientSecret: 'secret',
        scopes: [],
      },
      http
    );
    expect(result.scopes).toEqual(['identity', 'read']);
  });
});
