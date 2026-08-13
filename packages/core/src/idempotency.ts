import { createHash } from 'node:crypto';
export function publishIdempotencyKey(input: {
  userId: string;
  projectId: string;
  provider: string;
  scheduledAt: string;
}) {
  return createHash('sha256')
    .update(
      [input.userId, input.projectId, input.provider, input.scheduledAt].join(
        ':'
      ),
      'utf8'
    )
    .digest('hex');
}
export class DeliveryLedger {
  private completed = new Map<string, unknown>();
  async run<T>(
    key: string,
    operation: () => Promise<T>
  ): Promise<{ duplicate: boolean; result: T }> {
    if (this.completed.has(key))
      return { duplicate: true, result: this.completed.get(key) as T };
    const result = await operation();
    this.completed.set(key, result);
    return { duplicate: false, result };
  }
}
