import { describe, expect, it } from 'vitest';
import { planConnectedProviderSync } from './sync';

describe('planConnectedProviderSync', () => {
  it('queues only connected providers and reports the rest', () => {
    expect(
      planConnectedProviderSync(['youtube', 'instagram', 'reddit'], ['youtube'])
    ).toEqual({
      providers: ['youtube'],
      skipped: ['instagram', 'reddit'],
    });
  });

  it('deduplicates repeated provider requests', () => {
    expect(
      planConnectedProviderSync(
        ['instagram', 'instagram'],
        ['instagram', 'youtube']
      )
    ).toEqual({ providers: ['instagram'], skipped: [] });
  });
});
