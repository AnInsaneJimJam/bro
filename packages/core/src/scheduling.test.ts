import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { schedulingIntentToUtc } from './scheduling';

describe('scheduling', () => {
  it('preserves intent across a DST boundary', () => {
    const before = schedulingIntentToUtc(
      { localDateTime: '2027-03-13T19:30', timeZone: 'America/New_York' },
      DateTime.fromISO('2027-01-01T00:00Z')
    );
    const after = schedulingIntentToUtc(
      { localDateTime: '2027-03-15T19:30', timeZone: 'America/New_York' },
      DateTime.fromISO('2027-01-01T00:00Z')
    );
    expect(before.offsetMinutes).toBe(-300);
    expect(after.offsetMinutes).toBe(-240);
    expect(before.scheduledAtUtc).toContain('00:30:00.000Z');
    expect(after.scheduledAtUtc).toContain('23:30:00.000Z');
  });
});
