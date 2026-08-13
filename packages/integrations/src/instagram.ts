import type {
  CommentAdapter,
  ContentSourceAdapter,
  HttpClient,
  NormalizedContentItem,
  PublishInput,
  PublishingAdapter,
} from './index';
import { providerJson } from './http';
export class InstagramAdapter
  implements ContentSourceAdapter, PublishingAdapter, CommentAdapter
{
  constructor(
    private token: () => Promise<string>,
    private version: string,
    private http: HttpClient = fetch,
    private sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms))
  ) {}
  private async url(path: string, params: Record<string, string> = {}) {
    return `https://graph.facebook.com/${this.version}/${path}?${new URLSearchParams({ ...params, access_token: await this.token() })}`;
  }
  async connect() {
    const accounts = await providerJson<{
      data: Array<{
        instagram_business_account?: { id: string };
        name?: string;
      }>;
    }>(
      'instagram',
      this.http,
      await this.url('me/accounts', {
        fields: 'name,instagram_business_account',
      })
    );
    const eligible = accounts.data.find((x) => x.instagram_business_account);
    if (!eligible?.instagram_business_account)
      throw Object.assign(
        new Error(
          'Instagram publishing requires an eligible professional account linked to a Facebook Page.'
        ),
        { code: 'INSTAGRAM_ACCOUNT_INELIGIBLE' }
      );
    return {
      accountId: eligible.instagram_business_account.id,
      accountName: eligible.name || 'Instagram professional account',
    };
  }
  async refreshConnection() {
    await this.connect();
  }
  async disconnect() {}
  async syncOwnedContent(input: {
    connectionId: string;
    limit: number;
  }): Promise<NormalizedContentItem[]> {
    const data = await providerJson<{
      data: Array<{
        id: string;
        caption?: string;
        media_type: string;
        timestamp: string;
        permalink?: string;
      }>;
    }>(
      'instagram',
      this.http,
      await this.url(`${input.connectionId}/media`, {
        fields: 'id,caption,media_type,timestamp,permalink',
        limit: String(Math.min(input.limit, 100)),
      })
    );
    return data.data.map((x) => ({
      provider: 'instagram',
      externalId: x.id,
      text: x.caption || '',
      publishedAt: x.timestamp,
      url: x.permalink,
      metrics: {},
    }));
  }
  async validateMedia(input: PublishInput) {
    const errors = [];
    if (input.provider !== 'instagram') errors.push('Wrong provider');
    if (!/^https:\/\//.test(input.mediaUrl))
      errors.push('Instagram requires a temporary HTTPS media URL');
    if (!input.providerAccountId)
      errors.push('Instagram professional account ID is required');
    return { valid: !errors.length, errors };
  }
  async publish(input: PublishInput) {
    if (input.existingExternalId) {
      const status = await this.getPublishStatus(input.existingExternalId);
      if (status === 'published')
        return { externalId: input.existingExternalId };
    }
    const validation = await this.validateMedia(input);
    if (!validation.valid) throw new Error(validation.errors.join('; '));
    const created = await providerJson<{ id: string }>(
      'instagram',
      this.http,
      await this.url(`${input.providerAccountId}/media`, {
        media_type: 'REELS',
        video_url: input.mediaUrl,
        caption: input.caption || '',
      }),
      { method: 'POST' }
    );
    if (!created.id)
      throw new Error('Instagram did not return a publishing container ID');
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const status = await this.getPublishStatus(created.id);
      if (status === 'published') {
        ready = true;
        break;
      }
      if (status === 'failed')
        throw new Error(
          'Instagram rejected or expired the publishing container'
        );
      await this.sleep(Math.min(30_000, 2_000 * Math.pow(1.25, attempt)));
    }
    if (!ready)
      throw Object.assign(
        new Error('Instagram container processing timed out'),
        { retryable: true, externalId: created.id }
      );
    const published = await providerJson<{ id: string }>(
      'instagram',
      this.http,
      await this.url(`${input.providerAccountId}/media_publish`, {
        creation_id: created.id,
      }),
      { method: 'POST' }
    );
    if (!published.id)
      throw new Error('Instagram did not return a published media ID');
    return { externalId: published.id, url: `https://www.instagram.com/` };
  }
  async getPublishStatus(externalId: string) {
    const data = await providerJson<{ status_code?: string }>(
      'instagram',
      this.http,
      await this.url(externalId, { fields: 'status_code' })
    );
    return data.status_code === 'FINISHED'
      ? 'published'
      : data.status_code === 'ERROR' || data.status_code === 'EXPIRED'
        ? 'failed'
        : 'processing';
  }
  async syncOwnedMediaComments(input: { mediaIds: string[] }) {
    const output = [];
    for (const mediaId of input.mediaIds) {
      const data = await providerJson<{
        data: Array<{ id: string; text: string; timestamp: string }>;
      }>(
        'instagram',
        this.http,
        await this.url(`${mediaId}/comments`, {
          fields: 'id,text,timestamp',
          limit: '100',
        })
      );
      for (const item of data.data)
        output.push({
          externalId: item.id,
          mediaId,
          text: item.text,
          createdAt: item.timestamp,
        });
    }
    return output;
  }
}
