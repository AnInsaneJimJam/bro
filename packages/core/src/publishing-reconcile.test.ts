import { describe, expect, it } from 'vitest';
import {
  aggregateDestinationState,
  reconcileStalePublishDestinations,
  type Destination,
} from './publishing';

describe('stale publish recovery', () => {
  it('marks only unfinished destinations retryable', () => {
    const destinations: Destination[] = [
      {
        provider: 'youtube',
        state: 'published',
        attempts: 1,
        externalId: 'yt',
      },
      { provider: 'instagram', state: 'uploading', attempts: 1 },
      { provider: 'youtube', state: 'cancelled', attempts: 0 },
    ];

    reconcileStalePublishDestinations(destinations);

    expect(destinations[0]?.state).toBe('published');
    expect(destinations[1]?.state).toBe('failed_retryable');
    expect(destinations[1]?.error).toContain('worker stopped');
    expect(destinations[2]?.state).toBe('cancelled');
    expect(aggregateDestinationState(destinations)).toBe('partially_published');
  });

  it('recovers a queued destination with no successful platform', () => {
    const destinations: Destination[] = [
      { provider: 'instagram', state: 'scheduled', attempts: 0 },
    ];

    reconcileStalePublishDestinations(destinations);

    expect(aggregateDestinationState(destinations)).toBe('failed_retryable');
  });
});
