import { describe, expect, it, vi } from 'vitest';
import {
  InstagramAdapter,
  RedditAdapter,
  YouTubeAdapter,
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
      () => json({ data: [{ name: 'Page' }] })
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
      code: 'HTTP_429',
      retryable: true,
    });
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
  it('creates, waits for, and publishes an Instagram Reel container', async () => {
    const calls: string[] = [];
    const http: HttpClient = async (url) => {
      calls.push(url);
      if (url.includes('/acct/media?')) return json({ id: 'container' });
      if (url.includes('/container?')) return json({ status_code: 'FINISHED' });
      if (url.includes('/acct/media_publish?'))
        return json({ id: 'ig-published' });
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
    expect(calls.some((x) => x.includes('media_publish'))).toBe(true);
  });
});
