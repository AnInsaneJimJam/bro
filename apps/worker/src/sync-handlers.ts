import { and, eq, inArray } from 'drizzle-orm';
import {
  comments,
  createDatabase,
  creatorContentItems,
  platformConnections,
  socialPosts,
} from '@bro/db';
import {
  InstagramAdapter,
  RedditAdapter,
  YouTubeAdapter,
  type CommentAdapter,
  type ContentSourceAdapter,
} from '@bro/integrations';
import type { JobHandlers } from './jobs';
import { accessToken } from './provider-token';

function encryptionKey() {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error('TOKEN_ENCRYPTION_KEY is not configured');
  return Buffer.from(raw, 'base64');
}

export function createSyncHandlers(): Pick<
  JobHandlers,
  'sync-content' | 'sync-comments'
> {
  const database = createDatabase(),
    key = encryptionKey();
  async function connection(userId: string, provider: string) {
    const [row] = await database.db
      .select()
      .from(platformConnections)
      .where(
        and(
          eq(platformConnections.userId, userId),
          eq(platformConnections.provider, provider)
        )
      )
      .limit(1);
    if (!row)
      throw Object.assign(new Error(`${provider} is not connected`), {
        code: 'CONNECTION_MISSING',
      });
    return row;
  }
  function adapter(
    row: typeof platformConnections.$inferSelect
  ): ContentSourceAdapter {
    const token = async () => accessToken(database, row, key);
    if (row.provider === 'youtube') return new YouTubeAdapter(token);
    if (row.provider === 'instagram')
      return new InstagramAdapter(
        token,
        process.env.META_API_VERSION || 'v24.0'
      );
    return new RedditAdapter(
      token,
      process.env.REDDIT_INTEGRATION_ENABLED === 'true',
      process.env.REDDIT_USER_AGENT || 'bro-mvp'
    );
  }
  return {
    'sync-content': async ({ userId, providers }) => {
      const summary: Record<string, number> = {};
      for (const provider of providers) {
        const row = await connection(userId, provider);
        try {
          const items = await adapter(row).syncOwnedContent({
            connectionId: row.providerAccountId,
            limit: 50,
          });
          if (items.length)
            await database.db
              .insert(creatorContentItems)
              .values(
                items.map((item) => ({
                  userId,
                  provider: item.provider,
                  providerId: item.externalId,
                  title: item.title,
                  body: item.text,
                  metrics: item.metrics,
                  publishedAt: new Date(item.publishedAt),
                  canonicalUrl: item.url,
                  syncedAt: new Date(),
                }))
              )
              .onConflictDoUpdate({
                target: [
                  creatorContentItems.userId,
                  creatorContentItems.provider,
                  creatorContentItems.providerId,
                ],
                set: { syncedAt: new Date() },
              });
          await database.db
            .update(platformConnections)
            .set({
              status: 'healthy',
              lastSyncAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(platformConnections.id, row.id));
          summary[provider] = items.length;
        } catch (error) {
          await database.db
            .update(platformConnections)
            .set({
              status: 'error',
              metadata: {
                lastError:
                  error instanceof Error
                    ? error.message
                    : 'Provider sync failed',
              },
              updatedAt: new Date(),
            })
            .where(eq(platformConnections.id, row.id));
          throw error;
        }
      }
      return summary;
    },
    'sync-comments': async ({ userId, providers }) => {
      const posts = await database.db
        .select()
        .from(socialPosts)
        .where(
          and(
            eq(socialPosts.userId, userId),
            inArray(socialPosts.provider, providers)
          )
        );
      const summary: Record<string, number> = {};
      for (const provider of providers) {
        const owned = posts.filter(
          (post) => post.provider === provider && post.providerMediaId
        );
        if (!owned.length) {
          summary[provider] = 0;
          continue;
        }
        const row = await connection(userId, provider),
          source = adapter(row) as ContentSourceAdapter & CommentAdapter;
        const synced = await source.syncOwnedMediaComments({
          connectionId: row.providerAccountId,
          mediaIds: owned.map((post) => post.providerMediaId!),
        });
        const postByExternal = new Map(
          owned.map((post) => [post.providerMediaId, post.id])
        );
        if (synced.length)
          await database.db
            .insert(comments)
            .values(
              synced.map((comment) => ({
                userId,
                postId: postByExternal.get(comment.mediaId)!,
                providerCommentId: comment.externalId,
                text: comment.text,
                commentedAt: new Date(comment.createdAt),
                syncedAt: new Date(),
                status: 'visible',
              }))
            )
            .onConflictDoUpdate({
              target: [comments.postId, comments.providerCommentId],
              set: { syncedAt: new Date(), status: 'visible' },
            });
        summary[provider] = synced.length;
      }
      return summary;
    },
  };
}
