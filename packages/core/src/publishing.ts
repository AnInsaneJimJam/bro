import type { PublishState } from './index';
export type DestinationState =
  | 'scheduled'
  | 'processing'
  | 'uploading'
  | 'published'
  | 'failed_retryable'
  | 'failed_permanent'
  | 'cancelled';
export type Destination = {
  provider: 'youtube' | 'instagram';
  state: DestinationState;
  attempts: number;
  externalId?: string;
  url?: string;
  error?: string;
};
export function requiresPublishConfirmation(input: {
  autoPublish: { youtube: boolean; instagram: boolean };
  providers: Array<'youtube' | 'instagram'>;
}) {
  return input.providers.some((provider) => !input.autoPublish[provider]);
}
export function initialPublishState(input: {
  autoPublish: { youtube: boolean; instagram: boolean };
  providers: Array<'youtube' | 'instagram'>;
}): PublishState {
  return requiresPublishConfirmation(input)
    ? 'awaiting_confirmation'
    : 'scheduled';
}
export function aggregateDestinationState(
  destinations: Destination[]
): PublishState {
  if (destinations.every((d) => d.state === 'published')) return 'published';
  if (
    destinations.some((d) => d.state === 'published') &&
    destinations.some((d) => d.state.startsWith('failed'))
  )
    return 'partially_published';
  if (destinations.some((d) => d.state === 'failed_retryable'))
    return 'failed_retryable';
  if (destinations.every((d) => d.state === 'failed_permanent'))
    return 'failed_permanent';
  if (destinations.some((d) => d.state === 'uploading')) return 'uploading';
  return 'processing';
}
export function retryableDestinations(destinations: Destination[]) {
  return destinations
    .filter((d) => d.state === 'failed_retryable')
    .map((d) => d.provider);
}
export type ConfirmationCard = {
  projectId: string;
  mediaName: string;
  providers: Array<'youtube' | 'instagram'>;
  title?: string;
  caption?: string;
  scheduledAt?: string;
  timeZone: string;
  visibility: 'public' | 'unlisted' | 'private';
};
export function validateConfirmationCard(card: ConfirmationCard) {
  if (
    !card.projectId ||
    !card.mediaName ||
    !card.providers.length ||
    !card.timeZone
  )
    throw new Error('Incomplete publishing confirmation');
  return card;
}
