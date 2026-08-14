import { describe, expect, it, vi } from 'vitest';
import {
  InstagramAdapter,
  RedditAdapter,
  YouTubeAdapter,
  exchangeAuthorizationCode,
  type HttpClient,
} from './index';
const json = (value: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(value), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  );
describe('official adapters', () => {
  it('exchanges direct Instagram login codes for long-lived tokens', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const http: HttpClient = (url, init) => {
      calls.push({ url, init });
      return url.includes('api.instagram.com/oauth/access_token')
        ? json({ access_token: 'short-token', user_id: 'ig-1' })
        : json({ access_token: 'long-token', expires_in: 5_184_000 });
    };
    const tokens = await exchangeAuthorizationCode(
      'instagram',
      {
        code: 'authorization-code',
        verifier: 'unused',
        redirectUri: 'https://bro.example/api/oauth/instagram/callback',
        clientId: 'instagram-app',
        clientSecret: 'instagram-secret',
        scopes: ['instagram_business_basic'],
      },
      http
    );
    expect(tokens.accessToken).toBe('long-token');
    expect(calls[0]?.url).toBe('https://api.instagram.com/oauth/access_token');
    expect(calls[0]?.init?.body?.toString()).toContain(
      'code=authorization-code'
    );
    expect(calls[1]?.url).toContain(
      'https://graph.instagram.com/access_token?'
    );
  });

  it('normalizes YouTube owned content', async () => {
    const calls: string[] = [];
    const http: HttpClient = (url) => {
      calls.push(url);
      if (url.includes('/videos?'))
        return json({
          items: [
            {
              id: 'v1',
              snippet: {
                title: 'Title',
                description: 'Body',
                publishedAt: '2026-01-01T00:00:00Z',
                tags: ['ai'],
              },
              statistics: { viewCount: '42', likeCount: '5' },
            },
          ],
        });
      return json({
        items: [
          {
            id: { videoId: 'v1' },
            snippet: {
              title: 'Title',
              description: 'Body',
              publishedAt: '2026-01-01T00:00:00Z',
            },
          },
        ],
      });
    };
    const result = await new YouTubeAdapter(
      async () => 'token',
      http
    ).syncOwnedContent({ connectionId: 'channel', limit: 10 });
    expect(result[0]).toMatchObject({
      provider: 'youtube',
      externalId: 'v1',
      title: 'Title',
      metrics: { viewCount: 42, likeCount: 5 },
    });
    expect(calls[0]).toContain('googleapis.com/youtube/v3/search');
  });
  it('surfaces ineligible Instagram accounts', async () => {
    const adapter = new InstagramAdapter(
      async () => 'token',
      'v24.0',
      () => json({})
    );
    await expect(adapter.connect()).rejects.toMatchObject({
      code: 'INSTAGRAM_ACCOUNT_INELIGIBLE',
    });
  });
  it('fails closed when Reddit is disabled', async () => {
    const adapter = new RedditAdapter(
      async () => 'token',
      false,
      'bro-test',
      vi.fn()
    );
    await expect(adapter.connect()).rejects.toMatchObject({
      code: 'REDDIT_DISABLED',
    });
  });
  it('maps quota errors as retryable', async () => {
    const adapter = new YouTubeAdapter(
      async () => 'token',
      () => json({ error: 'quota' }, 429)
    );
    await expect(adapter.connect()).rejects.toMatchObject({
      code: 'PROVIDER_RATE_LIMITED',
      retryable: true,
    });
  });
  it('redacts provider payloads and honors retry-after guidance', async () => {
    const adapter = new YouTubeAdapter(
      async () => 'token',
      () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              error: {
                errors: [{ reason: 'rateLimitExceeded' }],
                message: 'request included secret-token-value',
              },
            }),
            { status: 429, headers: { 'retry-after': '12' } }
          )
        )
    );
    const error = await adapter.connect().catch((value) => value);
    expect(error).toMatchObject({
      code: 'PROVIDER_RATE_LIMITED',
      retryable: true,
      retryAfterMs: 12_000,
    });
    expect(String(error.message)).not.toContain('secret-token-value');
  });
});
describe('publishing adapters', () => {
  it('performs YouTube resumable upload', async () => {
    const calls: string[] = [];
    const http: HttpClient = async (url) => {
      calls.push(url);
      if (url.includes('uploadType=resumable'))
        return new Response(null, {
          status: 200,
          headers: { location: 'https://upload.test/session' },
        });
      if (url === 'https://media.test/video.mp4')
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      if (url.includes('youtube/v3/videos?part=status'))
        return new Response(
          JSON.stringify({
            items: [{ status: { uploadStatus: 'processed' } }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      return new Response(JSON.stringify({ id: 'yt-published' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    };
    const result = await new YouTubeAdapter(async () => 'token', http).publish({
      idempotencyKey: 'key',
      provider: 'youtube',
      mediaUrl: 'https://media.test/video.mp4',
      title: 'Short',
      mimeType: 'video/mp4',
      contentLength: 3,
    });
    expect(result.externalId).toBe('yt-published');
    expect(calls).toContain('https://upload.test/session');
  });
  it('keeps a processing YouTube upload retryable without uploading again', async () => {
    const calls: string[] = [];
    const http: HttpClient = async (url) => {
      calls.push(url);
      return new Response(
        JSON.stringify({ items: [{ status: { uploadStatus: 'uploaded' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    };
    await expect(
      new YouTubeAdapter(async () => 'token', http).publish({
        idempotencyKey: 'key',
        provider: 'youtube',
        mediaUrl: 'https://media.test/video.mp4',
        title: 'Short',
        mimeType: 'video/mp4',
        contentLength: 3,
        existingExternalId: 'yt-processing',
      })
    ).rejects.toMatchObject({ retryable: true, externalId: 'yt-processing' });
    expect(calls).toHaveLength(1);
  });
  it('creates, waits for, and publishes an Instagram Reel container', async () => {
    const calls: string[] = [];
    const http: HttpClient = async (url) => {
      calls.push(url);
      if (url.includes('/acct/media?')) return json({ id: 'container' });
      if (url.includes('/container?')) return json({ status_code: 'FINISHED' });
      if (url.includes('/acct/media_publish?'))
        return json({ id: 'ig-published' });
      if (url.includes('/ig-published?'))
        return json({ permalink: 'https://www.instagram.com/reel/abc/' });
      return json({}, 404);
    };
    const result = await new InstagramAdapter(
      async () => 'token',
      'v24.0',
      http,
      async () => {}
    ).publish({
      idempotencyKey: 'key',
      provider: 'instagram',
      providerAccountId: 'acct',
      mediaUrl: 'https://media.test/video.mp4',
      caption: 'Caption',
    });
    expect(result.externalId).toBe('ig-published');
    expect(result.url).toBe('https://www.instagram.com/reel/abc/');
    expect(calls.some((x) => x.includes('media_publish'))).toBe(true);
  });
  it('publishes a finished container on a retry instead of duplicating it', async () => {
    const calls: string[] = [];
    const http: HttpClient = async (url) => {
      calls.push(url);
      if (url.includes('/container?')) return json({ status_code: 'FINISHED' });
      if (url.includes('/acct/media_publish?'))
        return json({ id: 'published-2' });
      if (url.includes('/published-2?'))
        return json({ permalink: 'https://www.instagram.com/reel/retry/' });
      return json({}, 404);
    };
    const result = await new InstagramAdapter(
      async () => 'token',
      'v24.0',
      http
    ).publish({
      idempotencyKey: 'key',
      provider: 'instagram',
      providerAccountId: 'acct',
      mediaUrl: 'https://media.test/video.mp4',
      existingExternalId: 'container',
    });
    expect(result).toEqual({
      externalId: 'published-2',
      url: 'https://www.instagram.com/reel/retry/',
    });
    expect(calls.some((x) => x.includes('/acct/media?'))).toBe(false);
  });
});
