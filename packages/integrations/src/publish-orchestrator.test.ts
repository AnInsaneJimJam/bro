import { describe, expect, it, vi } from 'vitest';
import {
  executePublishDestinations,
  type DestinationRecord,
} from './publish-orchestrator';
import type { PublishingAdapter } from './index';
const adapter = (publish: PublishingAdapter['publish']): PublishingAdapter => ({
  publish,
  validateMedia: async () => ({ valid: true, errors: [] }),
  getPublishStatus: async () => 'published',
});
const metadata = (provider: 'youtube' | 'instagram') => ({
  idempotencyKey: `key-${provider}`,
  provider,
  mediaUrl: 'https://media.test/video.mp4',
});
describe('destination orchestration', () => {
  it('does not republish a successful destination on partial retry', async () => {
    const youtube = vi.fn(async () => ({ externalId: 'yt' }));
    let instagramReady = false;
    const instagram = vi.fn(async (): Promise<{ externalId: string }> => {
      if (!instagramReady)
        throw Object.assign(new Error('temporary'), { retryable: true });
      return { externalId: 'ig' };
    });
    const destinations: DestinationRecord[] = [
      {
        provider: 'youtube',
        state: 'scheduled',
        attempts: 0,
        metadata: metadata('youtube'),
      },
      {
        provider: 'instagram',
        state: 'scheduled',
        attempts: 0,
        metadata: metadata('instagram'),
      },
    ];
    const first = await executePublishDestinations({
      destinations,
      adapters: { youtube: adapter(youtube), instagram: adapter(instagram) },
      persist: async () => {},
    });
    expect(first.state).toBe('partially_published');
    expect(youtube).toHaveBeenCalledTimes(1);
    instagramReady = true;
    const second = await executePublishDestinations({
      destinations,
      adapters: { youtube: adapter(youtube), instagram: adapter(instagram) },
      persist: async () => {},
    });
    expect(second.state).toBe('published');
    expect(youtube).toHaveBeenCalledTimes(1);
    expect(instagram).toHaveBeenCalledTimes(2);
  });
});
