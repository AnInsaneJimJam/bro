import type {
  CommentAdapter,
  ContentSourceAdapter,
  HttpClient,
  NormalizedContentItem,
  PublishInput,
  PublishingAdapter,
  TrendSignal,
  TrendSignalAdapter,
} from './index';
import { providerError, providerJson } from './http';
type Token = () => Promise<string>;
export class YouTubeAdapter
  implements
    ContentSourceAdapter,
    PublishingAdapter,
    CommentAdapter,
    TrendSignalAdapter
{
  constructor(
    private token: Token,
    private http: HttpClient = fetch
  ) {}
  private async headers() {
    return {
      authorization: `Bearer ${await this.token()}`,
      'content-type': 'application/json',
    };
  }
  async connect() {
    const mine = await providerJson<{
      items: Array<{ id: string; snippet: { title: string } }>;
    }>(
      'youtube',
      this.http,
      'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      { headers: await this.headers() }
    );
    const channel = mine.items[0];
    if (!channel)
      throw new Error(
        'No YouTube channel is available for this Google account'
      );
    return { accountId: channel.id, accountName: channel.snippet.title };
  }
  async refreshConnection() {
    await this.connect();
  }
  async disconnect() {}
  async syncOwnedContent(input: {
    connectionId: string;
    limit: number;
  }): Promise<NormalizedContentItem[]> {
    const q = new URLSearchParams({
      part: 'snippet',
      channelId: input.connectionId,
      type: 'video',
      order: 'date',
      maxResults: String(Math.min(input.limit, 50)),
    });
    const result = await providerJson<{
      items: Array<{
        id: { videoId: string };
        snippet: { title: string; description: string; publishedAt: string };
      }>;
    }>(
      'youtube',
      this.http,
      `https://www.googleapis.com/youtube/v3/search?${q}`,
      { headers: await this.headers() }
    );
    const details = await this.videoDetails(
      result.items.map((item) => item.id.videoId)
    );
    return result.items.map((x) => {
      const detail = details.get(x.id.videoId);
      return {
        provider: 'youtube',
        externalId: x.id.videoId,
        title: detail?.snippet?.title || x.snippet.title,
        text: [
          detail?.snippet?.description || x.snippet.description,
          detail?.snippet?.tags?.length
            ? `Tags: ${detail.snippet.tags.join(', ')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
        publishedAt: detail?.snippet?.publishedAt || x.snippet.publishedAt,
        url: `https://youtube.com/watch?v=${x.id.videoId}`,
        metrics: numericMetrics(detail?.statistics),
      };
    });
  }
  async validateMedia(input: PublishInput) {
    const errors = [];
    if (input.provider !== 'youtube') errors.push('Wrong provider');
    if (!input.title) errors.push('YouTube title is required');
    if (!input.contentLength || input.contentLength <= 0)
      errors.push('Media content length is required');
    if (!input.mimeType?.startsWith('video/'))
      errors.push('A video MIME type is required');
    return { valid: !errors.length, errors };
  }
  async publish(input: PublishInput) {
    if (input.existingExternalId) {
      const status = await this.getPublishStatus(input.existingExternalId);
      if (status === 'published')
        return {
          externalId: input.existingExternalId,
          url: `https://youtube.com/watch?v=${input.existingExternalId}`,
        };
    }
    const validation = await this.validateMedia(input);
    if (!validation.valid) throw new Error(validation.errors.join('; '));
    const token = await this.token(),
      metadata = JSON.stringify({
        snippet: {
          title: input.title,
          description: input.caption || '',
          categoryId: '22',
        },
        status: {
          privacyStatus: input.visibility || 'public',
          selfDeclaredMadeForKids: false,
        },
      });
    const session = await this.http(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json; charset=UTF-8',
          'x-upload-content-length': String(input.contentLength),
          'x-upload-content-type': input.mimeType!,
        },
        body: metadata,
      }
    );
    if (!session.ok) throw await providerError('youtube', session);
    const location = session.headers.get('location');
    if (!location)
      throw new Error('YouTube did not return a resumable session URL');
    const media = await this.http(input.mediaUrl);
    if (!media.ok || !media.body)
      throw Object.assign(
        new Error(`Could not fetch rendered media (${media.status})`),
        {
          code: `MEDIA_FETCH_${media.status}`,
          retryable: media.status === 429 || media.status >= 500,
        }
      );
    const uploadInit = {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': input.mimeType!,
        'content-length': String(input.contentLength),
      },
      body: media.body as unknown as BodyInit,
      duplex: 'half',
    } as RequestInit;
    const uploaded = await this.http(location, uploadInit);
    if (!uploaded.ok) throw await providerError('youtube', uploaded);
    const result = (await uploaded.json()) as { id: string };
    if (!result.id)
      throw new Error('YouTube upload response did not contain a video ID');
    return {
      externalId: result.id,
      url: `https://youtube.com/watch?v=${result.id}`,
    };
  }
  async getPublishStatus(externalId: string) {
    const result = await providerJson<{
      items: Array<{ status?: { uploadStatus?: string } }>;
    }>(
      'youtube',
      this.http,
      `https://www.googleapis.com/youtube/v3/videos?part=status&id=${encodeURIComponent(externalId)}`,
      { headers: await this.headers() }
    );
    const status = result.items[0]?.status?.uploadStatus;
    return status === 'processed'
      ? 'published'
      : status === 'failed' || status === 'rejected'
        ? 'failed'
        : 'processing';
  }
  async syncOwnedMediaComments(input: { mediaIds: string[] }) {
    const output = [];
    for (const mediaId of input.mediaIds) {
      const data = await providerJson<{
        items: Array<{
          id: string;
          snippet: {
            topLevelComment: {
              id: string;
              snippet: { textDisplay: string; publishedAt: string };
            };
          };
        }>;
      }>(
        'youtube',
        this.http,
        `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${encodeURIComponent(mediaId)}&maxResults=100`,
        { headers: await this.headers() }
      );
      for (const item of data.items)
        output.push({
          externalId: item.snippet.topLevelComment.id,
          mediaId,
          text: item.snippet.topLevelComment.snippet.textDisplay,
          createdAt: item.snippet.topLevelComment.snippet.publishedAt,
        });
    }
    return output;
  }
  async discover(input: {
    niche: string;
    countryCode: string;
    since: string;
  }): Promise<TrendSignal[]> {
    const q = new URLSearchParams({
      part: 'snippet',
      q: input.niche,
      type: 'video',
      order: 'date',
      publishedAfter: input.since,
      regionCode: input.countryCode,
      maxResults: '25',
    });
    const data = await providerJson<{
      items: Array<{
        id: { videoId: string };
        snippet: { title: string; publishedAt: string };
      }>;
    }>(
      'youtube',
      this.http,
      `https://www.googleapis.com/youtube/v3/search?${q}`,
      { headers: await this.headers() }
    );
    const details = await this.videoDetails(
      data.items.map((item) => item.id.videoId)
    );
    return data.items.map((x) => ({
      provider: 'youtube',
      externalId: x.id.videoId,
      title: x.snippet.title,
      reference: `https://youtube.com/watch?v=${x.id.videoId}`,
      observedAt: x.snippet.publishedAt,
      metrics: numericMetrics(details.get(x.id.videoId)?.statistics),
    }));
  }
  private async videoDetails(ids: string[]) {
    if (!ids.length) return new Map<string, YouTubeVideoDetail>();
    const query = new URLSearchParams({
      part: 'snippet,statistics',
      id: ids.join(','),
      maxResults: String(Math.min(ids.length, 50)),
    });
    const data = await providerJson<{ items: YouTubeVideoDetail[] }>(
      'youtube',
      this.http,
      `https://www.googleapis.com/youtube/v3/videos?${query}`,
      { headers: await this.headers() }
    );
    return new Map(
      data.items
        .filter((item) => typeof item.id === 'string')
        .map((item) => [item.id, item])
    );
  }
}
type YouTubeVideoDetail = {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    publishedAt?: string;
    tags?: string[];
  };
  statistics?: Record<string, string>;
};
function numericMetrics(statistics?: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(statistics || {}).flatMap(([key, value]) => {
      const number = Number(value);
      return Number.isFinite(number) ? [[key, number]] : [];
    })
  );
}
