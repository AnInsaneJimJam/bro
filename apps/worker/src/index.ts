import PgBoss from 'pg-boss';
import { and, eq, gt, inArray } from 'drizzle-orm';
import { redactSecrets } from '@bro/core';
import {
  backgroundJobs,
  createDatabase,
  getDatabaseSslOptions,
  platformConnections,
  publishJobs,
  socialPosts,
  videoProjects,
} from '@bro/db';
import { jobSchemas, type JobHandlers, type JobName } from './jobs';
import { createVideoHandlers } from './video-handlers';
import { createPublishHandler } from './publish-handler';
import { createSyncHandlers } from './sync-handlers';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.log(
    JSON.stringify({
      level: 'warn',
      service: 'bro-worker',
      message: 'DATABASE_URL missing; worker did not start',
    })
  );
  process.exitCode = 1;
} else {
  const ssl = getDatabaseSslOptions();
  const boss = new PgBoss({
    connectionString: databaseUrl,
    ...(ssl ? { ssl } : {}),
    retryLimit: Number(process.env.WORKER_RETRY_LIMIT || 5),
    retryBackoff: true,
  });
  await boss.start();
  let videoHandlers:
      Pick<JobHandlers, 'transcribe-video' | 'render-video'> | undefined,
    publishHandler: JobHandlers['publish-video'] | undefined,
    syncHandlers:
      Pick<JobHandlers, 'sync-content' | 'sync-comments'> | undefined;
  const names = Object.keys(jobSchemas) as JobName[];
  for (const name of names)
    await boss.work(
      name,
      { batchSize: Number(process.env.WORKER_CONCURRENCY || 4) },
      async (jobs) => {
        for (const job of jobs) {
          const data = jobSchemas[name].parse(job.data);
          console.log(
            JSON.stringify(
              redactSecrets({
                level: 'info',
                service: 'bro-worker',
                jobId: job.id,
                kind: name,
                correlationId: data.correlationId,
                message: 'Job accepted',
              })
            )
          );
          await markJob(job.id, 'processing');
          try {
            if (name === 'transcribe-video' || name === 'render-video') {
              videoHandlers ??= createVideoHandlers();
              await (
                videoHandlers[name] as (data: unknown) => Promise<unknown>
              )(data);
            } else if (name === 'publish-video') {
              publishHandler ??= createPublishHandler();
              await (publishHandler as (data: unknown) => Promise<unknown>)(
                data
              );
            } else if (name === 'refresh-recent-comments') {
              await enqueueRecentCommentRefreshes(boss);
            } else {
              syncHandlers ??= createSyncHandlers();
              await (syncHandlers[name] as (data: unknown) => Promise<unknown>)(
                data
              );
            }
            await markJob(job.id, 'completed');
          } catch (error) {
            await markJob(job.id, 'failed_retryable', error);
            if (name !== 'refresh-recent-comments')
              await markDomainFailure(
                name,
                data as unknown as {
                  userId: string;
                  projectId?: string;
                  publishJobId?: string;
                },
                error
              );
            throw error;
          }
        }
      }
    );
  await boss.schedule(
    'refresh-recent-comments',
    process.env.COMMENT_REFRESH_CRON || '17 */6 * * *',
    { correlationId: 'scheduled-comment-refresh' },
    { tz: 'UTC' }
  );
  console.log(
    JSON.stringify({
      level: 'info',
      service: 'bro-worker',
      message: 'worker ready',
      queues: names,
    })
  );
  const stop = async () => {
    await boss.stop({ graceful: true });
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

async function enqueueRecentCommentRefreshes(boss: PgBoss) {
  const database = createDatabase();
  try {
    const recent = await database.db
      .select({ userId: socialPosts.userId, provider: socialPosts.provider })
      .from(socialPosts)
      .where(
        and(
          gt(socialPosts.publishedAt, new Date(Date.now() - 14 * 86400e3)),
          inArray(socialPosts.provider, ['youtube', 'instagram'])
        )
      );
    const byUser = new Map<string, Set<'youtube' | 'instagram'>>();
    for (const item of recent) {
      if (
        !item.userId ||
        (item.provider !== 'youtube' && item.provider !== 'instagram')
      )
        continue;
      const values =
        byUser.get(item.userId) || new Set<'youtube' | 'instagram'>();
      values.add(item.provider);
      byUser.set(item.userId, values);
    }
    for (const [userId, candidates] of byUser) {
      const connected = await database.db
        .select({ provider: platformConnections.provider })
        .from(platformConnections)
        .where(
          and(
            eq(platformConnections.userId, userId),
            eq(platformConnections.status, 'healthy'),
            inArray(platformConnections.provider, [...candidates])
          )
        );
      const providers = connected
        .map((item) => item.provider)
        .filter(
          (value): value is 'youtube' | 'instagram' =>
            value === 'youtube' || value === 'instagram'
        );
      if (providers.length)
        await boss.send(
          'sync-comments',
          { userId, providers, correlationId: crypto.randomUUID() },
          {
            singletonKey: `scheduled-comments:${userId}`,
            singletonSeconds: 5 * 3600,
            retryLimit: Number(process.env.WORKER_RETRY_LIMIT || 5),
            retryBackoff: true,
          }
        );
    }
  } finally {
    await database.close();
  }
}

async function markDomainFailure(
  name: JobName,
  data: { userId: string; projectId?: string; publishJobId?: string },
  error: unknown
) {
  const database = createDatabase();
  try {
    if (
      (name === 'transcribe-video' || name === 'render-video') &&
      data.projectId
    )
      await database.db
        .update(videoProjects)
        .set({ state: 'failed', updatedAt: new Date() })
        .where(
          and(
            eq(videoProjects.id, data.projectId),
            eq(videoProjects.userId, data.userId)
          )
        );
    if (name === 'publish-video' && data.publishJobId)
      await database.db
        .update(publishJobs)
        .set({
          state: isRetryable(error) ? 'failed_retryable' : 'failed_permanent',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(publishJobs.id, data.publishJobId),
            eq(publishJobs.userId, data.userId)
          )
        );
  } finally {
    await database.close();
  }
}
function isRetryable(error: unknown) {
  return (
    !!error &&
    typeof error === 'object' &&
    ('retryable' in error
      ? Boolean(error.retryable)
      : !('code' in error && String(error.code).includes('PERMANENT')))
  );
}
async function markJob(bossJobId: string, state: string, error?: unknown) {
  const database = createDatabase();
  try {
    await database.db
      .update(backgroundJobs)
      .set({
        state,
        attemptCount: state === 'processing' ? 1 : undefined,
        lastErrorCode:
          error && typeof error === 'object' && 'code' in error
            ? String(error.code)
            : undefined,
        lastErrorMessage:
          error instanceof Error ? error.message.slice(0, 500) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(backgroundJobs.bossJobId, bossJobId));
  } finally {
    await database.close();
  }
}
