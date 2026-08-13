import { describe, expect, it } from 'vitest';
import { DeliveryLedger, publishIdempotencyKey } from './idempotency';
describe('delivery idempotency', () => {
  it('returns a stable key', () =>
    expect(
      publishIdempotencyKey({
        userId: 'u',
        projectId: 'p',
        provider: 'youtube',
        scheduledAt: '2027-01-01T00:00Z',
      })
    ).toHaveLength(64));
  it('does not repeat completed delivery', async () => {
    const ledger = new DeliveryLedger();
    let calls = 0;
    await ledger.run('same', async () => ++calls);
    const second = await ledger.run('same', async () => ++calls);
    expect(calls).toBe(1);
    expect(second.duplicate).toBe(true);
  });
});
