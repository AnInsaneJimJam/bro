import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { schedulingIntentToUtc } from '@bro/core';
import {
  backgroundJobs,
  createDatabase,
  publishDestinations,
  publishJobs,
} from '@bro/db';
import { requireUser } from '@/lib/auth';
import { cancelJob, enqueueJob } from '@/lib/jobs';
import { jsonError } from '@/lib/http';
const reschedule = z.object({
  localDateTime: z.string(),
  timeZone: z.string().min(3),
});
export async function PATCH(
  req: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    if (user.demo)
      return NextResponse.json(
        {
          error:
            'Demo calendar changes are local and do not represent durable publishing jobs.',
        },
        { status: 409 }
      );
    const { jobId } = await context.params,
      data = reschedule.parse(await req.json());
    z.string().uuid().parse(jobId);
    const database = createDatabase();
    close = database.close;
    const [job] = await database.db
      .select()
      .from(publishJobs)
      .where(and(eq(publishJobs.id, jobId), eq(publishJobs.userId, user.id)))
      .limit(1);
    if (!job || job.state !== 'scheduled')
      throw new Error('Only an owned scheduled job can be rescheduled');
    const [reference] = await database.db
      .select()
      .from(backgroundJobs)
      .where(
        and(
          eq(backgroundJobs.userId, user.id),
          eq(backgroundJobs.resourceId, jobId),
          eq(backgroundJobs.state, 'queued')
        )
      )
      .limit(1);
    if (reference?.bossJobId)
      await cancelJob('publish-video', reference.bossJobId);
    const scheduledAt = new Date(schedulingIntentToUtc(data).scheduledAtUtc),
      providers = (
        await database.db
          .select({ provider: publishDestinations.provider })
          .from(publishDestinations)
          .where(eq(publishDestinations.jobId, jobId))
      ).map((x) => x.provider as 'youtube' | 'instagram'),
      correlationId = crypto.randomUUID(),
      bossJobId = await enqueueJob(
        'publish-video',
        { userId: user.id, publishJobId: jobId, providers, correlationId },
        {
          singletonKey: `publish:${jobId}:${scheduledAt.toISOString()}`,
          startAfter: scheduledAt,
        }
      );
    await database.db.transaction(async (tx) => {
      await tx
        .update(backgroundJobs)
        .set({ state: 'cancelled', updatedAt: new Date() })
        .where(
          and(
            eq(backgroundJobs.userId, user.id),
            eq(backgroundJobs.resourceId, jobId),
            eq(backgroundJobs.state, 'queued')
          )
        );
      await tx.insert(backgroundJobs).values({
        userId: user.id,
        bossJobId,
        kind: 'publish-video',
        resourceType: 'publish_job',
        resourceId: jobId,
        state: 'queued',
        correlationId,
      });
      await tx
        .update(publishJobs)
        .set({
          scheduledAt,
          displayTimeZone: data.timeZone,
          updatedAt: new Date(),
        })
        .where(and(eq(publishJobs.id, jobId), eq(publishJobs.userId, user.id)));
    });
    return NextResponse.json({
      jobId,
      state: 'scheduled',
      scheduledAt: scheduledAt.toISOString(),
      timeZone: data.timeZone,
    });
  } catch (e) {
    return jsonError(e);
  } finally {
    await close?.();
  }
}
export async function DELETE(
  _req: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    if (user.demo)
      return NextResponse.json(
        { error: 'Demo calendar has no external job to cancel.' },
        { status: 409 }
      );
    const { jobId } = await context.params;
    z.string().uuid().parse(jobId);
    const database = createDatabase();
    close = database.close;
    const [job] = await database.db
      .select()
      .from(publishJobs)
      .where(and(eq(publishJobs.id, jobId), eq(publishJobs.userId, user.id)))
      .limit(1);
    if (!job || job.state !== 'scheduled')
      throw new Error('Only an owned scheduled job can be cancelled');
    const [reference] = await database.db
      .select()
      .from(backgroundJobs)
      .where(
        and(
          eq(backgroundJobs.userId, user.id),
          eq(backgroundJobs.resourceId, jobId),
          eq(backgroundJobs.state, 'queued')
        )
      )
      .limit(1);
    if (reference?.bossJobId)
      await cancelJob('publish-video', reference.bossJobId);
    await database.db.transaction(async (tx) => {
      await tx
        .update(publishJobs)
        .set({ state: 'cancelled', updatedAt: new Date() })
        .where(and(eq(publishJobs.id, jobId), eq(publishJobs.userId, user.id)));
      await tx
        .update(publishDestinations)
        .set({ state: 'cancelled', updatedAt: new Date() })
        .where(eq(publishDestinations.jobId, jobId));
      await tx
        .update(backgroundJobs)
        .set({ state: 'cancelled', updatedAt: new Date() })
        .where(
          and(
            eq(backgroundJobs.userId, user.id),
            eq(backgroundJobs.resourceId, jobId)
          )
        );
    });
    return NextResponse.json({ jobId, state: 'cancelled' });
  } catch (e) {
    return jsonError(e);
  } finally {
    await close?.();
  }
}
