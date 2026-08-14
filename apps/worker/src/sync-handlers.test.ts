import { describe, expect, it } from 'vitest';
import { ownedSocialPostValues } from './sync-handlers';

describe('owned social post projection', () => {
  it('projects existing YouTube and Instagram media but excludes Reddit', () => {
    const syncedAt = new Date('2026-08-14T00:00:00.000Z');
    expect(
      ownedSocialPostValues(
        'user-1',
        [
          {
            provider: 'youtube',
            externalId: 'yt-1',
            title: 'Short',
            text: 'Body',
            publishedAt: '2026-08-13T00:00:00.000Z',
            url: 'https://youtube.com/watch?v=yt-1',
            metrics: { viewCount: 12 },
          },
          {
            provider: 'instagram',
            externalId: 'ig-1',
            text: 'Caption',
            publishedAt: '2026-08-12T00:00:00.000Z',
            url: 'https://instagram.com/reel/ig-1',
            metrics: {},
          },
          {
            provider: 'reddit',
            externalId: 'rd-1',
            text: 'Post',
            publishedAt: '2026-08-11T00:00:00.000Z',
            metrics: {},
          },
        ],
        syncedAt
      )
    ).toEqual([
      {
        userId: 'user-1',
        provider: 'youtube',
        providerMediaId: 'yt-1',
        canonicalUrl: 'https://youtube.com/watch?v=yt-1',
        publishedAt: new Date('2026-08-13T00:00:00.000Z'),
        metrics: { viewCount: 12 },
        updatedAt: syncedAt,
      },
      {
        userId: 'user-1',
        provider: 'instagram',
        providerMediaId: 'ig-1',
        canonicalUrl: 'https://instagram.com/reel/ig-1',
        publishedAt: new Date('2026-08-12T00:00:00.000Z'),
        metrics: {},
        updatedAt: syncedAt,
      },
    ]);
  });
});
