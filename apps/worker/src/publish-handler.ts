import { createClient } from '@supabase/supabase-js';
import { and, eq } from 'drizzle-orm';
import {
  createDatabase,
  platformConnections,
  publishDestinations,
  publishJobs,
  socialPosts,
  videoProjects,
} from '@bro/db';
import {
  executePublishDestinations,
  InstagramAdapter,
  YouTubeAdapter,
  type DestinationRecord,
} from '@bro/integrations';
import type { JobHandlers } from './jobs';
import { accessToken } from './provider-token';
export function createPublishHandler(): JobHandlers['publish-video'] {
  return async (data) => {
    const database = createDatabase();
    try {
      const [[job], [project], rows, connections] = await Promise.all([
        database.db
          .select()
          .from(publishJobs)
          .where(
            and(
              eq(publishJobs.id, data.publishJobId),
              eq(publishJobs.userId, data.userId)
            )
          )
          .limit(1),
        database.db
          .select()
          .from(videoProjects)
          .innerJoin(publishJobs, eq(publishJobs.projectId, videoProjects.id))
          .where(
            and(
              eq(publishJobs.id, data.publishJobId),
              eq(videoProjects.userId, data.userId)
            )
          )
          .limit(1),
        database.db
          .select()
          .from(publishDestinations)
          .where(eq(publishDestinations.jobId, data.publishJobId)),
        database.db
          .select()
          .from(platformConnections)
          .where(eq(platformConnections.userId, data.userId)),
      ]);
      const mediaKey =
        project?.video_projects.renderedKey ||
        project?.video_projects.originalKey;
      if (!job || !project || !mediaKey)
        throw new Error('Owned publish job or publishable media not found');
      const usingRenderedMedia = Boolean(project.video_projects.renderedKey);
      const storage = createClient(
          required('NEXT_PUBLIC_SUPABASE_URL'),
          required('SUPABASE_SERVICE_ROLE_KEY'),
          { auth: { persistSession: false } }
        ).storage,
        { data: signed, error } = await storage
          .from(
            usingRenderedMedia
              ? process.env.SUPABASE_RENDERS_BUCKET || 'bro-renders'
              : process.env.SUPABASE_ORIGINALS_BUCKET || 'bro-originals'
          )
          .createSignedUrl(mediaKey, 3600);
      if (error || !signed?.signedUrl)
        throw new Error(
          error?.message || 'Could not create provider-fetchable media URL'
        );
      const key = Buffer.from(required('TOKEN_ENCRYPTION_KEY'), 'base64'),
        connectionMap = new Map(
          connections.map((connection) => [connection.provider, connection])
        ),
        accounts = new Map(
          connections.map((connection) => [
            connection.provider,
            connection.providerAccountId,
          ])
        ),
        token = async (provider: 'youtube' | 'instagram') => {
          const connection = connectionMap.get(provider);
          if (!connection)
            throw new Error(`${provider} connection token is unavailable`);
          return accessToken(database, connection, key);
        };
      const youtube = new YouTubeAdapter(() => token('youtube')),
        instagram = new InstagramAdapter(
          () => token('instagram'),
          process.env.INSTAGRAM_API_VERSION || 'v24.0'
        );
      const projectMeta = project.video_projects.metadata as {
        size?: number;
        mimeType?: string;
        detectedMimeType?: string;
        renderedSize?: number;
        renderedMimeType?: string;
      };
      const destinations: DestinationRecord[] = rows
        .filter((row) =>
          data.providers.includes(row.provider as 'youtube' | 'instagram')
        )
        .map((row) => {
          const provider = row.provider as 'youtube' | 'instagram',
            meta = row.metadata as {
              title?: string;
              description?: string;
              visibility?: 'public' | 'unlisted' | 'private';
              caption?: string;
            };
          return {
            provider,
            state: row.state as DestinationRecord['state'],
            attempts: row.attemptCount || 0,
            externalId: row.externalId || undefined,
            url: row.url || undefined,
            error: row.errorMessage || undefined,
            metadata: {
              idempotencyKey: `${job.id}:${provider}`,
              provider,
              mediaUrl: signed.signedUrl,
              providerAccountId: accounts.get(provider),
              title: meta.title,
              caption: provider === 'youtube' ? meta.description : meta.caption,
              visibility: meta.visibility,
              mimeType: usingRenderedMedia
                ? projectMeta.renderedMimeType || 'video/mp4'
                : projectMeta.detectedMimeType ||
                  projectMeta.mimeType ||
                  'video/mp4',
              contentLength: usingRenderedMedia
                ? projectMeta.renderedSize
                : projectMeta.size,
            },
          };
        });
      if (destinations.length !== new Set(data.providers).size)
        throw Object.assign(
          new Error(
            'The publish job destinations no longer match the queued request.'
          ),
          { code: 'PUBLISH_DESTINATION_MISMATCH', retryable: false }
        );
      await database.db
        .update(publishJobs)
        .set({ state: 'processing', updatedAt: new Date() })
        .where(eq(publishJobs.id, job.id));
      const result = await executePublishDestinations({
        destinations,
        adapters: { youtube, instagram },
        persist: async (destination) => {
          await database.db
            .update(publishDestinations)
            .set({
              state: destination.state,
              attemptCount: destination.attempts,
              externalId: destination.externalId,
              url: destination.url,
              errorMessage: destination.error,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(publishDestinations.jobId, job.id),
                eq(publishDestinations.provider, destination.provider)
              )
            );
        },
      });
      await database.db.transaction(async (tx) => {
        await tx
          .update(publishJobs)
          .set({ state: result.state, updatedAt: new Date() })
          .where(eq(publishJobs.id, job.id));
        const published = result.destinations.filter(
          (destination) =>
            destination.state === 'published' && destination.externalId
        );
        if (published.length)
          await tx
            .insert(socialPosts)
            .values(
              published.map((destination) => ({
                userId: data.userId,
                projectId: job.projectId,
                provider: destination.provider,
                providerMediaId: destination.externalId!,
                canonicalUrl: destination.url,
                publishedAt: new Date(),
                metrics: {},
              }))
            )
            .onConflictDoUpdate({
              target: [
                socialPosts.userId,
                socialPosts.provider,
                socialPosts.providerMediaId,
              ],
              set: {
                projectId: job.projectId,
                publishedAt: new Date(),
                updatedAt: new Date(),
              },
            });
      });
      return result;
    } finally {
      await database.close();
    }
  };
}
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
