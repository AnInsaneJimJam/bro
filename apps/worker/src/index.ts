import PgBoss from 'pg-boss';
import { and, eq, gt, inArray, lt } from 'drizzle-orm';
import {
  aggregateDestinationState,
  redactSecrets,
  reconcileStalePublishDestinations,
  type Destination,
} from '@bro/core';
import {
  backgroundJobs,
  createDatabase,
  getDatabaseSslOptions,
  platformConnections,
  publishDestinations,
  publishJobs,
  socialPosts,
  videoProjects,
} from '@bro/db';
import { jobSchemas, type JobHandlers, type JobName } from './jobs';
import { createVideoHandlers } from './video-handlers';
import { createPublishHandler } from './publish-handler';
import { createSyncHandlers } from './sync-handlers';
import { pgBossConnectionString } from './database-url';

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
    connectionString: pgBossConnectionString(databaseUrl, Boolean(ssl)),
    ...(ssl ? { ssl } : {}),
    retryLimit: Number(process.env.WORKER_RETRY_LIMIT || 5),
    retryBackoff: true,
  });
  await boss.start();
  let videoHandlers:
      | Pick<
          JobHandlers,
          'validate-video' | 'transcribe-video' | 'render-video'
        >
      | undefined,
    publishHandler: JobHandlers['publish-video'] | undefined,
    syncHandlers:
      Pick<JobHandlers, 'sync-content' | 'sync-comments'> | undefined;
  const names = Object.keys(jobSchemas) as JobName[];
  for (const name of names)
    await boss.createQueue(name, {
      name,
      retryLimit: Number(process.env.WORKER_RETRY_LIMIT || 5),
      retryBackoff: true,
    });
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
            if (
              name === 'validate-video' ||
              name === 'transcribe-video' ||
              name === 'render-video'
            ) {
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
  await reconcileStalePublishJobs().catch((error) => {
    console.warn(
      JSON.stringify(
        redactSecrets({
          level: 'warn',
          service: 'bro-worker',
          message: 'Initial publish reconciliation failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      )
    );
  });
  const reconcileInterval = setInterval(() => {
    void reconcileStalePublishJobs().catch((error) => {
      console.warn(
        JSON.stringify(
          redactSecrets({
            level: 'warn',
            service: 'bro-worker',
            message: 'Publish reconciliation failed',
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        )
      );
    });
  }, reconcileIntervalMs());
  reconcileInterval.unref?.();
  console.log(
    JSON.stringify({
      level: 'info',
      service: 'bro-worker',
      message: 'worker ready',
      queues: names,
    })
  );
  const stop = async () => {
    clearInterval(reconcileInterval);
    await boss.stop({ graceful: true });
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

function stalePublishAfterMs() {
  const seconds = Number(process.env.PUBLISH_STALE_AFTER_SECONDS || 1800);
  return Math.max(60, Number.isFinite(seconds) ? seconds : 1800) * 1000;
}

function reconcileIntervalMs() {
  const seconds = Number(process.env.PUBLISH_RECONCILE_INTERVAL_SECONDS || 300);
  return Math.max(30, Number.isFinite(seconds) ? seconds : 300) * 1000;
}

async function reconcileStalePublishJobs() {
  const database = createDatabase();
  try {
    const cutoff = new Date(Date.now() - stalePublishAfterMs());
    const staleJobs = await database.db
      .select({ id: publishJobs.id })
      .from(publishJobs)
      .where(
        and(
          inArray(publishJobs.state, ['processing', 'uploading']),
          lt(publishJobs.updatedAt, cutoff)
        )
      );
    if (!staleJobs.length) return 0;

    const jobIds = staleJobs.map((job) => job.id);
    const rows = await database.db
      .select()
      .from(publishDestinations)
      .where(inArray(publishDestinations.jobId, jobIds));
    const rowsByJob = new Map<string, typeof rows>();
    for (const row of rows) {
      if (!row.jobId) continue;
      const values = rowsByJob.get(row.jobId) || [];
      values.push(row);
      rowsByJob.set(row.jobId, values);
    }
    let recovered = 0;
    for (const job of staleJobs) {
      const jobRows = rowsByJob.get(job.id) || [];
      if (!jobRows.length) continue;
      const destinations: Destination[] = jobRows.map((row) => ({
        provider: row.provider as Destination['provider'],
        state: row.state as Destination['state'],
        attempts: row.attemptCount || 0,
        externalId: row.externalId || undefined,
        url: row.url || undefined,
        error: row.errorMessage || undefined,
      }));
      reconcileStalePublishDestinations(destinations);
      const state = aggregateDestinationState(destinations);
      const now = new Date();
      const claimed = await database.db.transaction(async (tx) => {
        const [stale] = await tx
          .update(publishJobs)
          .set({ state, updatedAt: now })
          .where(
            and(
              eq(publishJobs.id, job.id),
              inArray(publishJobs.state, ['processing', 'uploading']),
              lt(publishJobs.updatedAt, cutoff)
            )
          )
          .returning({ id: publishJobs.id });
        if (!stale) return false;
        await tx
          .update(publishDestinations)
          .set({
            state: 'failed_retryable',
            errorCode: 'PUBLISH_STALE',
            errorMessage:
              'The publish worker stopped before this destination completed. Retry is safe.',
            updatedAt: now,
          })
          .where(
            and(
              eq(publishDestinations.jobId, job.id),
              inArray(publishDestinations.state, [
                'scheduled',
                'processing',
                'uploading',
              ])
            )
          );
        await tx
          .update(backgroundJobs)
          .set({
            state:
              state === 'published' ||
              state === 'cancelled' ||
              state === 'failed_permanent'
                ? 'completed'
                : 'failed_retryable',
            lastErrorCode:
              state === 'published' || state === 'cancelled'
                ? null
                : 'PUBLISH_STALE',
            lastErrorMessage:
              state === 'published' || state === 'cancelled'
                ? null
                : 'The publish worker stopped before this job completed. Retry is safe.',
            updatedAt: now,
          })
          .where(
            and(
              eq(backgroundJobs.resourceId, job.id),
              eq(backgroundJobs.kind, 'publish-video'),
              inArray(backgroundJobs.state, ['queued', 'processing'])
            )
          );
        return true;
      });
      if (claimed) recovered++;
    }
    if (recovered)
      console.log(
        JSON.stringify({
          level: 'info',
          service: 'bro-worker',
          message: 'Recovered stale publish jobs',
          count: recovered,
        })
      );
    return recovered;
  } finally {
    await database.close();
  }
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
    // A transcript only drafts post metadata; it is not required to publish.
    // Keep a validated project publishable and record why drafting stopped.
    if (name === 'transcribe-video' && data.projectId) {
      const [project] = await database.db
        .select({ metadata: videoProjects.metadata })
        .from(videoProjects)
        .where(
          and(
            eq(videoProjects.id, data.projectId),
            eq(videoProjects.userId, data.userId)
          )
        )
        .limit(1);
      await database.db
        .update(videoProjects)
        .set({
          metadata: {
            ...((project?.metadata || {}) as object),
            transcriptionStatus: 'failed',
            metadataNotice: redactSecrets(
              error instanceof Error
                ? `Bro could not read the spoken text: ${error.message} You can still write the post fields yourself and publish.`
                : 'Bro could not read the spoken text. You can still write the post fields yourself and publish.'
            ),
          },
          state: 'ready',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(videoProjects.id, data.projectId),
            eq(videoProjects.userId, data.userId)
          )
        );
    } else if (
      (name === 'validate-video' || name === 'render-video') &&
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
    if (name === 'publish-video' && data.publishJobId) {
      const retryable = isRetryable(error),
        destinationState = retryable ? 'failed_retryable' : 'failed_permanent';
      await database.db
        .update(publishJobs)
        .set({
          state: destinationState,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(publishJobs.id, data.publishJobId),
            eq(publishJobs.userId, data.userId)
          )
        );
      await database.db
        .update(publishDestinations)
        .set({
          state: destinationState,
          errorMessage:
            error instanceof Error
              ? error.message.slice(0, 500)
              : 'Publish worker failed',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(publishDestinations.jobId, data.publishJobId),
            inArray(publishDestinations.state, [
              'scheduled',
              'processing',
              'uploading',
            ])
          )
        );
    }
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
