import { describe, expect, it } from 'vitest';
import {
  aggregateDestinationState,
  initialPublishState,
  retryableDestinations,
} from './publishing';
describe('publishing policy', () => {
  it('requires confirmation when auto publish is off', () =>
    expect(
      initialPublishState({
        autoPublish: { youtube: false, instagram: true },
        providers: ['youtube', 'instagram'],
      })
    ).toBe('awaiting_confirmation'));
  it('allows a specific enabled path', () =>
    expect(
      initialPublishState({
        autoPublish: { youtube: true, instagram: false },
        providers: ['youtube'],
      })
    ).toBe('scheduled'));
  it('tracks two-destination partial failure', () => {
    const destinations = [
      {
        provider: 'youtube' as const,
        state: 'published' as const,
        attempts: 1,
      },
      {
        provider: 'instagram' as const,
        state: 'failed_retryable' as const,
        attempts: 1,
      },
    ];
    expect(aggregateDestinationState(destinations)).toBe('partially_published');
    expect(retryableDestinations(destinations)).toEqual(['instagram']);
  });
});
