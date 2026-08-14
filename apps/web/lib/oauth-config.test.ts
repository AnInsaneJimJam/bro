import { afterEach, describe, expect, it } from 'vitest';
import { missingProviderScopes, oauthAuthorizationUrl } from './oauth-config';

const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
});

describe('OAuth provider configuration', () => {
  it('identifies provider connections missing required scopes', () => {
    expect(
      missingProviderScopes('youtube', [
        'https://www.googleapis.com/auth/youtube.upload',
      ])
    ).toContain('https://www.googleapis.com/auth/youtube.force-ssl');
    expect(
      missingProviderScopes('instagram', [
        'instagram_business_basic',
        'instagram_business_content_publish',
        'instagram_business_manage_comments',
      ])
    ).toEqual([]);
  });
  it('fails closed when a required YouTube redirect is missing', () => {
    process.env.GOOGLE_CLIENT_ID = 'client';
    process.env.GOOGLE_SCOPES = 'scope';
    delete process.env.GOOGLE_REDIRECT_URI;
    expect(() =>
      oauthAuthorizationUrl('youtube', { state: 'state', challenge: 'pkce' })
    ).toThrow(/GOOGLE_REDIRECT_URI is not configured/);
  });

  it('rejects insecure non-local redirect URIs', () => {
    process.env.INSTAGRAM_APP_ID = 'app';
    process.env.INSTAGRAM_SCOPES = 'instagram_business_basic';
    process.env.INSTAGRAM_REDIRECT_URI = 'http://example.com/callback';
    expect(() =>
      oauthAuthorizationUrl('instagram', {
        state: 'state',
        challenge: 'pkce',
      })
    ).toThrow(/absolute HTTPS URL/);
  });

  it('uses direct Instagram professional login credentials', () => {
    process.env.INSTAGRAM_APP_ID = 'instagram-app';
    process.env.INSTAGRAM_SCOPES =
      'instagram_business_basic,instagram_business_content_publish';
    process.env.INSTAGRAM_REDIRECT_URI =
      'https://bro.example/api/oauth/instagram/callback';
    const url = new URL(
      oauthAuthorizationUrl('instagram', {
        state: 'signed-state',
        challenge: 'unused-for-instagram',
      })
    );
    expect(url.origin).toBe('https://www.instagram.com');
    expect(url.searchParams.get('client_id')).toBe('instagram-app');
    expect(url.searchParams.get('enable_fb_login')).toBe('0');
    expect(url.searchParams.get('scope')).toContain(
      'instagram_business_content_publish'
    );
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
