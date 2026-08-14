import { aggregateDestinationState, type Destination } from '@bro/core';
import type { PublishInput, PublishingAdapter } from './index';
export type DestinationRecord = Destination & { metadata: PublishInput };

export async function executePublishDestinations(input: {
  destinations: DestinationRecord[];
  adapters: Record<'youtube' | 'instagram', PublishingAdapter>;
  persist: (destination: DestinationRecord) => Promise<void>;
}) {
  for (const destination of input.destinations) {
    if (
      destination.state === 'published' ||
      destination.state === 'cancelled' ||
      destination.state === 'failed_permanent'
    )
      continue;
    const adapter = input.adapters[destination.provider];
    destination.state = 'uploading';
    destination.attempts++;
    await input.persist(destination);
    try {
      const result = await adapter.publish({
        ...destination.metadata,
        existingExternalId: destination.externalId,
      });
      destination.externalId = result.externalId;
      destination.url = result.url;
      destination.state = 'published';
      destination.error = undefined;
    } catch (error) {
      const typed = error as {
        message?: string;
        retryable?: boolean;
        externalId?: string;
      };
      if (typed.externalId) destination.externalId = typed.externalId;
      destination.error = typed.message || 'Publishing failed';
      destination.state = typed.retryable
        ? 'failed_retryable'
        : 'failed_permanent';
    }
    await input.persist(destination);
  }
  return {
    state: aggregateDestinationState(input.destinations),
    destinations: input.destinations,
  };
}

export type PublishExecutionResult = Awaited<
  ReturnType<typeof executePublishDestinations>
>;

/**
 * A retry request may contain only failed destinations. Recompute the parent
 * job state from the complete destination set so a previously published
 * platform remains visible as partial success.
 */
export function aggregatePublishResult(
  allDestinations: DestinationRecord[],
  execution: PublishExecutionResult
): PublishExecutionResult {
  return {
    ...execution,
    state: aggregateDestinationState(allDestinations),
    destinations: allDestinations,
  };
}
