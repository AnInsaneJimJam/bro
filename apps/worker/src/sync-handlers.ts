import { and, eq, inArray, sql } from 'drizzle-orm';
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
  type NormalizedContentItem,
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
        process.env.INSTAGRAM_API_VERSION || 'v24.0'
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
          if (items.length) {
            const syncedAt = new Date();
            await database.db.transaction(async (tx) => {
              await tx
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
                    syncedAt,
                  }))
                )
                .onConflictDoUpdate({
                  target: [
                    creatorContentItems.userId,
                    creatorContentItems.provider,
                    creatorContentItems.providerId,
                  ],
                  set: {
                    title: sql`excluded.title`,
                    body: sql`excluded.body`,
                    metrics: sql`excluded.metrics`,
                    publishedAt: sql`excluded.published_at`,
                    canonicalUrl: sql`excluded.canonical_url`,
                    syncedAt: sql`excluded.synced_at`,
                    updatedAt: syncedAt,
                  },
                });
              const ownedPosts = ownedSocialPostValues(userId, items, syncedAt);
              if (ownedPosts.length)
                await tx
                  .insert(socialPosts)
                  .values(ownedPosts)
                  .onConflictDoUpdate({
                    target: [
                      socialPosts.userId,
                      socialPosts.provider,
                      socialPosts.providerMediaId,
                    ],
                    set: {
                      canonicalUrl: sql`excluded.canonical_url`,
                      publishedAt: sql`excluded.published_at`,
                      metrics: sql`excluded.metrics`,
                      updatedAt: syncedAt,
                    },
                  });
            });
          }
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
                ...((row.metadata || {}) as Record<string, unknown>),
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
        const row = await connection(userId, provider),
          source = adapter(row) as ContentSourceAdapter & CommentAdapter;
        const syncedAt = new Date();
        try {
          const owned = posts.filter(
            (post) => post.provider === provider && post.providerMediaId
          );
          const synced = owned.length
            ? await source.syncOwnedMediaComments({
                connectionId: row.providerAccountId,
                mediaIds: owned.map((post) => post.providerMediaId!),
              })
            : [];
          const postByExternal = new Map(
            owned.map((post) => [post.providerMediaId, post.id])
          );
          const validComments = synced.filter((comment) =>
            postByExternal.has(comment.mediaId)
          );
          if (validComments.length)
            await database.db
              .insert(comments)
              .values(
                validComments.map((comment) => ({
                  userId,
                  postId: postByExternal.get(comment.mediaId)!,
                  providerCommentId: comment.externalId,
                  text: comment.text,
                  commentedAt: new Date(comment.createdAt),
                  syncedAt,
                  status: 'visible',
                }))
              )
              .onConflictDoUpdate({
                target: [comments.postId, comments.providerCommentId],
                set: {
                  text: sql`excluded.text`,
                  commentedAt: sql`excluded.commented_at`,
                  syncedAt: sql`excluded.synced_at`,
                  status: 'visible',
                  updatedAt: syncedAt,
                },
              });
          await database.db
            .update(platformConnections)
            .set({
              status: 'healthy',
              metadata: {
                ...((row.metadata || {}) as Record<string, unknown>),
                lastCommentSyncAt: syncedAt.toISOString(),
              },
              updatedAt: syncedAt,
            })
            .where(eq(platformConnections.id, row.id));
          summary[provider] = validComments.length;
        } catch (error) {
          await database.db
            .update(platformConnections)
            .set({
              status: 'error',
              metadata: {
                ...((row.metadata || {}) as Record<string, unknown>),
                lastCommentSyncError:
                  error instanceof Error
                    ? error.message
                    : 'Comment sync failed',
              },
              updatedAt: new Date(),
            })
            .where(eq(platformConnections.id, row.id));
          throw error;
        }
      }
      return summary;
    },
  };
}

export function ownedSocialPostValues(
  userId: string,
  items: NormalizedContentItem[],
  syncedAt: Date
) {
  return items
    .filter(
      (item) => item.provider === 'youtube' || item.provider === 'instagram'
    )
    .map((item) => ({
      userId,
      provider: item.provider,
      providerMediaId: item.externalId,
      canonicalUrl: item.url,
      publishedAt: new Date(item.publishedAt),
      metrics: item.metrics,
      updatedAt: syncedAt,
    }));
}
