import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { createDatabase, publishDestinations, publishJobs } from '@bro/db';
import { requireUser } from '@/lib/auth';
import { queuePublish } from '@/lib/publish-queue';
import { jsonError } from '@/lib/http';

export async function POST(
  _request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    if (user.demo)
      return NextResponse.json(
        { error: 'Demo mode has no failed live destination to retry.' },
        { status: 409 }
      );
    const { jobId } = await context.params;
    z.string().uuid().parse(jobId);
    const database = createDatabase();
    close = database.close;
    const [job] = await database.db
      .select()
      .from(publishJobs)
      .where(
        and(
          eq(publishJobs.id, jobId),
          eq(publishJobs.userId, user.id),
          inArray(publishJobs.state, [
            'failed_retryable',
            'partially_published',
          ])
        )
      )
      .limit(1);
    if (!job?.projectId)
      throw Object.assign(new Error('Owned retryable publish job not found'), {
        status: 404,
      });
    const providers = (
      await database.db
        .select({ provider: publishDestinations.provider })
        .from(publishDestinations)
        .where(
          and(
            eq(publishDestinations.jobId, jobId),
            eq(publishDestinations.state, 'failed_retryable')
          )
        )
    ).map((item) => z.enum(['youtube', 'instagram']).parse(item.provider));
    if (!providers.length)
      return NextResponse.json(
        {
          error:
            'No retryable destination remains. Successful destinations will never be republished.',
        },
        { status: 409 }
      );
    const [claimed] = await database.db
      .update(publishJobs)
      .set({ state: 'draft', updatedAt: new Date() })
      .where(
        and(
          eq(publishJobs.id, jobId),
          eq(publishJobs.userId, user.id),
          inArray(publishJobs.state, [
            'failed_retryable',
            'partially_published',
          ])
        )
      )
      .returning({ id: publishJobs.id });
    if (!claimed)
      return NextResponse.json(
        { error: 'This retry was already claimed.' },
        { status: 409 }
      );
    try {
      const queued = await queuePublish(database, {
        userId: user.id,
        jobId,
        projectId: job.projectId,
        providers,
        scheduledAt: new Date(),
      });
      return NextResponse.json(
        {
          jobId,
          state: 'scheduled',
          retriedProviders: providers,
          ...queued,
        },
        { status: 202 }
      );
    } catch (error) {
      await database.db
        .update(publishJobs)
        .set({ state: job.state, updatedAt: new Date() })
        .where(
          and(
            eq(publishJobs.id, jobId),
            eq(publishJobs.userId, user.id),
            eq(publishJobs.state, 'draft')
          )
        );
      throw error;
    }
  } catch (error) {
    return jsonError(error);
  } finally {
    await close?.();
  }
}
