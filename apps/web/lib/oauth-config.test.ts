import { afterEach, describe, expect, it } from 'vitest';
import { oauthAuthorizationUrl } from './oauth-config';

const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
});

describe('OAuth provider configuration', () => {
  it('fails closed when a required YouTube redirect is missing', () => {
    process.env.GOOGLE_CLIENT_ID = 'client';
    process.env.GOOGLE_SCOPES = 'scope';
    delete process.env.GOOGLE_REDIRECT_URI;
    expect(() =>
      oauthAuthorizationUrl('youtube', { state: 'state', challenge: 'pkce' })
    ).toThrow(/GOOGLE_REDIRECT_URI is not configured/);
  });

  it('rejects insecure non-local redirect URIs', () => {
    process.env.META_APP_ID = 'app';
    process.env.META_SCOPES = 'instagram_basic';
    process.env.META_REDIRECT_URI = 'http://example.com/callback';
    expect(() =>
      oauthAuthorizationUrl('instagram', {
        state: 'state',
        challenge: 'pkce',
      })
    ).toThrow(/absolute HTTPS URL/);
  });

  it('builds an encoded YouTube request from complete configuration', () => {
    process.env.GOOGLE_CLIENT_ID = 'client';
    process.env.GOOGLE_SCOPES = 'scope.one scope.two';
    process.env.GOOGLE_REDIRECT_URI =
      'https://bro.example/api/oauth/youtube/callback';
    const url = new URL(
      oauthAuthorizationUrl('youtube', {
        state: 'signed-state',
        challenge: 'pkce-challenge',
      })
    );
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://bro.example/api/oauth/youtube/callback'
    );
    expect(url.searchParams.get('scope')).toBe('scope.one scope.two');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });
});
