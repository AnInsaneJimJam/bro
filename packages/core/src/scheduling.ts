import { DateTime } from 'luxon';

export type SchedulingIntent = { localDateTime: string; timeZone: string };

export function schedulingIntentToUtc(
  input: SchedulingIntent,
  now: DateTime = DateTime.utc()
) {
  const local = DateTime.fromISO(input.localDateTime, { zone: input.timeZone });
  if (!local.isValid)
    throw new Error(`Invalid local date/time: ${local.invalidExplanation}`);
  if (local.toUTC() <= now)
    throw new Error('Scheduled time must be in the future');
  return {
    scheduledAtUtc: local.toUTC().toISO()!,
    displayTimeZone: input.timeZone,
    offsetMinutes: local.offset,
  };
}
