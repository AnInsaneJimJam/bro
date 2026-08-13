import type { Provider } from '@bro/core';
export type { HttpClient } from './http';
export * from './oauth';
export * from './youtube';
export * from './instagram';
export * from './reddit';
export * from './token-exchange';
export * from './token-refresh';
export * from './revoke';
export * from './publish-orchestrator';
export type NormalizedContentItem = {
  provider: Provider;
  externalId: string;
  title?: string;
  text: string;
  publishedAt: string;
  url?: string;
  metrics: Record<string, number>;
};
export type TrendSignal = {
  provider: Provider;
  externalId: string;
  title: string;
  reference: string;
  observedAt: string;
  metrics: Record<string, number>;
};
export interface ContentSourceAdapter {
  connect(args: unknown): Promise<{ accountId: string; accountName: string }>;
  refreshConnection(connectionId: string): Promise<void>;
  syncOwnedContent(input: {
    connectionId: string;
    limit: number;
  }): Promise<NormalizedContentItem[]>;
  disconnect(connectionId: string): Promise<void>;
}
export interface PublishingAdapter {
  validateMedia(
    input: PublishInput
  ): Promise<{ valid: boolean; errors: string[] }>;
  publish(input: PublishInput): Promise<{ externalId: string; url?: string }>;
  getPublishStatus(
    externalId: string
  ): Promise<'processing' | 'published' | 'failed'>;
}
export interface CommentAdapter {
  syncOwnedMediaComments(input: {
    connectionId: string;
    mediaIds: string[];
  }): Promise<
    Array<{
      externalId: string;
      mediaId: string;
      text: string;
      createdAt: string;
    }>
  >;
}
export interface TrendSignalAdapter {
  discover(input: {
    niche: string;
    countryCode: string;
    since: string;
  }): Promise<TrendSignal[]>;
}
export type PublishInput = {
  idempotencyKey: string;
  provider: Exclude<Provider, 'reddit'>;
  mediaUrl: string;
  providerAccountId?: string;
  title?: string;
  caption?: string;
  scheduledAt?: string;
  mimeType?: string;
  contentLength?: number;
  visibility?: 'public' | 'unlisted' | 'private';
  existingExternalId?: string;
};
export class DemoAdapter implements ContentSourceAdapter, TrendSignalAdapter {
  async connect() {
    return { accountId: 'demo', accountName: 'Demo creator' };
  }
  async refreshConnection() {}
  async disconnect() {}
  async syncOwnedContent(): Promise<NormalizedContentItem[]> {
    return [
      {
        provider: 'youtube',
        externalId: 'demo-1',
        title: 'My AI workflow',
        text: 'Three AI memory tricks',
        publishedAt: new Date().toISOString(),
        metrics: { views: 1240 },
      },
    ];
  }
  async discover(input: {
    niche: string;
    countryCode: string;
    since: string;
  }): Promise<TrendSignal[]> {
    return [
      {
        provider: 'youtube',
        externalId: 'signal-1',
        title: `${input.niche} in ${input.countryCode}`,
        reference: 'demo://signal-1',
        observedAt: new Date().toISOString(),
        metrics: { views: 8200 },
      },
    ];
  }
}
export class ProviderUnavailableError extends Error {
  constructor(
    public provider: Provider,
    public code: string,
    message: string,
    public retryable = false
  ) {
    super(message);
  }
}
