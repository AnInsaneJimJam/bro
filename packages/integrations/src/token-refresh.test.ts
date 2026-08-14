import { describe, expect, it, vi } from 'vitest';
import {
  refreshInstagramAccessToken,
  refreshProviderAccessToken,
} from './token-refresh';
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
  it('refreshes a long-lived Instagram token and preserves its scopes', async () => {
    let requestedUrl = '';
    const result = await refreshInstagramAccessToken(
      'long-lived-token',
      ['instagram_business_basic'],
      async (input) => {
        requestedUrl = String(input);
        return new Response(
          JSON.stringify({ access_token: 'refreshed-token', expires_in: 3600 }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
    );
    const url = new URL(requestedUrl);
    expect(url.origin + url.pathname).toBe(
      'https://graph.instagram.com/refresh_access_token'
    );
    expect(url.searchParams.get('grant_type')).toBe('ig_refresh_token');
    expect(url.searchParams.get('access_token')).toBe('long-lived-token');
    expect(result.accessToken).toBe('refreshed-token');
    expect(result.scopes).toEqual(['instagram_business_basic']);
  });
});
