import type {
  ContentSourceAdapter,
  HttpClient,
  NormalizedContentItem,
  TrendSignal,
  TrendSignalAdapter,
} from './index';
import { providerJson } from './http';
export class RedditAdapter implements ContentSourceAdapter, TrendSignalAdapter {
  constructor(
    private token: () => Promise<string>,
    private enabled: boolean,
    private userAgent: string,
    private http: HttpClient = fetch
  ) {}
  private async headers() {
    if (!this.enabled)
      throw Object.assign(
        new Error(
          'Reddit integration is disabled pending approved API access.'
        ),
        { code: 'REDDIT_DISABLED' }
      );
    return {
      authorization: `Bearer ${await this.token()}`,
      'user-agent': this.userAgent,
    };
  }
  async connect() {
    const me = await providerJson<{ id: string; name: string }>(
      'reddit',
      this.http,
      'https://oauth.reddit.com/api/v1/me',
      { headers: await this.headers() }
    );
    return { accountId: me.id, accountName: me.name };
  }
  async refreshConnection() {
    await this.connect();
  }
  async disconnect() {}
  async syncOwnedContent(input: {
    limit: number;
  }): Promise<NormalizedContentItem[]> {
    const data = await providerJson<{
      data: {
        children: Array<{
          kind: string;
          data: {
            id: string;
            title?: string;
            selftext?: string;
            body?: string;
            created_utc: number;
            permalink: string;
          };
        }>;
      };
    }>(
      'reddit',
      this.http,
      `https://oauth.reddit.com/user/me/overview?limit=${Math.min(input.limit, 100)}`,
      { headers: await this.headers() }
    );
    return data.data.children.map((x) => ({
      provider: 'reddit',
      externalId: x.data.id,
      title: x.data.title,
      text: x.data.selftext || x.data.body || '',
      publishedAt: new Date(x.data.created_utc * 1000).toISOString(),
      url: `https://reddit.com${x.data.permalink}`,
      metrics: {},
    }));
  }
  async discover(input: {
    niche: string;
    since: string;
  }): Promise<TrendSignal[]> {
    const q = new URLSearchParams({
      q: input.niche,
      sort: 'hot',
      t: 'week',
      limit: '25',
      restrict_sr: 'false',
    });
    const data = await providerJson<{
      data: {
        children: Array<{
          data: {
            id: string;
            title: string;
            permalink: string;
            created_utc: number;
            score: number;
            num_comments: number;
          };
        }>;
      };
    }>('reddit', this.http, `https://oauth.reddit.com/search?${q}`, {
      headers: await this.headers(),
    });
    return data.data.children
      .filter(
        (x) => new Date(x.data.created_utc * 1000).toISOString() >= input.since
      )
      .map((x) => ({
        provider: 'reddit',
        externalId: x.data.id,
        title: x.data.title,
        reference: `https://reddit.com${x.data.permalink}`,
        observedAt: new Date(x.data.created_utc * 1000).toISOString(),
        metrics: { score: x.data.score, comments: x.data.num_comments },
      }));
  }
}
