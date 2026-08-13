import { and, eq, inArray } from 'drizzle-orm';
import { publishIdempotencyKey } from '@bro/core';
import {
  backgroundJobs,
  createDatabase,
  publishDestinations,
  publishJobs,
} from '@bro/db';
import { enqueueJob } from './jobs';

export async function queuePublish(
  database: ReturnType<typeof createDatabase>,
  input: {
    userId: string;
    jobId: string;
    projectId: string;
    providers: Array<'youtube' | 'instagram'>;
    scheduledAt: Date;
    startAfter?: Date;
  }
) {
  const correlationId = crypto.randomUUID(),
    bossJobId = await enqueueJob(
      'publish-video',
      {
        userId: input.userId,
        publishJobId: input.jobId,
        providers: input.providers,
        correlationId,
      },
      { singletonKey: `publish:${input.jobId}`, startAfter: input.startAfter }
    );
  await database.db.transaction(async (tx) => {
    await tx
      .update(publishJobs)
      .set({ state: 'scheduled', updatedAt: new Date() })
      .where(
        and(
          eq(publishJobs.id, input.jobId),
          eq(publishJobs.userId, input.userId)
        )
      );
    await tx
      .update(publishDestinations)
      .set({ state: 'scheduled', updatedAt: new Date() })
      .where(
        and(
          eq(publishDestinations.jobId, input.jobId),
          inArray(publishDestinations.provider, input.providers)
        )
      );
    await tx.insert(backgroundJobs).values({
      userId: input.userId,
      bossJobId,
      kind: 'publish-video',
      resourceType: 'publish_job',
      resourceId: input.jobId,
      state: 'queued',
      correlationId,
    });
  });
  return {
    bossJobId,
    correlationId,
    idempotencyKeys: Object.fromEntries(
      input.providers.map((destination) => [
        destination,
        publishIdempotencyKey({
          userId: input.userId,
          projectId: input.projectId,
          provider: destination,
          scheduledAt: input.scheduledAt.toISOString(),
        }),
      ])
    ),
  };
}
