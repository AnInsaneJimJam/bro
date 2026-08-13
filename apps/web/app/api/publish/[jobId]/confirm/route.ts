import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { createDatabase, publishDestinations, publishJobs } from '@bro/db';
import { requireUser } from '@/lib/auth';
import { jsonError } from '@/lib/http';
import { queuePublish } from '@/lib/publish-queue';

export async function POST(
  _request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    if (user.demo)
      return NextResponse.json(
        {
          mode: 'demo',
          demo: true,
          state: 'scheduled',
          persisted: false,
          notice:
            'Demo schedule confirmed locally. No YouTube or Instagram request was made.',
        },
        { status: 202 }
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
    if (
      !job ||
      job.state !== 'awaiting_confirmation' ||
      !job.projectId ||
      !job.scheduledAt
    )
      return NextResponse.json(
        {
          error:
            'This owned publish request is no longer awaiting confirmation.',
        },
        { status: 409 }
      );
    const providers = (
      await database.db
        .select({ provider: publishDestinations.provider })
        .from(publishDestinations)
        .where(
          and(
            eq(publishDestinations.jobId, jobId),
            eq(publishDestinations.state, 'awaiting_confirmation')
          )
        )
    ).map((item) => z.enum(['youtube', 'instagram']).parse(item.provider));
    if (!providers.length)
      throw new Error('No pending destinations remain on this job');
    const [claimed] = await database.db
      .update(publishJobs)
      .set({
        state: 'draft',
        autoPublishSnapshot: {
          ...(job.autoPublishSnapshot as object),
          explicitlyConfirmed: true,
        },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(publishJobs.id, jobId),
          eq(publishJobs.userId, user.id),
          eq(publishJobs.state, 'awaiting_confirmation')
        )
      )
      .returning({ id: publishJobs.id });
    if (!claimed)
      return NextResponse.json(
        { error: 'This publish request was already confirmed or cancelled.' },
        { status: 409 }
      );
    let queued;
    try {
      queued = await queuePublish(database, {
        userId: user.id,
        jobId,
        projectId: job.projectId,
        providers,
        scheduledAt: job.scheduledAt,
        startAfter: job.scheduledAt > new Date() ? job.scheduledAt : undefined,
      });
    } catch (error) {
      await database.db
        .update(publishJobs)
        .set({ state: 'awaiting_confirmation', updatedAt: new Date() })
        .where(
          and(
            eq(publishJobs.id, jobId),
            eq(publishJobs.userId, user.id),
            eq(publishJobs.state, 'draft')
          )
        );
      throw error;
    }
    return NextResponse.json(
      {
        jobId,
        state: 'scheduled',
        scheduledAt: job.scheduledAt,
        timeZone: job.displayTimeZone,
        ...queued,
      },
      { status: 202 }
    );
  } catch (error) {
    return jsonError(error);
  } finally {
    await close?.();
  }
}
