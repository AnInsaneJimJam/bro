import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import {
  backgroundJobs,
  captionCues,
  createDatabase,
  videoProjects,
} from '@bro/db';
import { requireUser } from '@/lib/auth';
import { enqueueJob } from '@/lib/jobs';
import { jsonError } from '@/lib/http';
export async function POST(
  _req: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    if (user.demo)
      return NextResponse.json(
        { error: 'Demo mode does not claim to render a stored video.' },
        { status: 409 }
      );
    const { projectId } = await context.params;
    z.string().uuid().parse(projectId);
    const database = createDatabase();
    close = database.close;
    const [project] = await database.db
      .select({ state: videoProjects.state })
      .from(videoProjects)
      .where(
        and(eq(videoProjects.id, projectId), eq(videoProjects.userId, user.id))
      )
      .limit(1);
    if (!project)
      throw Object.assign(new Error('Video project not found'), {
        status: 404,
      });
    // Captions live alongside a normally publish-ready 'ready' project (the
    // transcript pass never blocks publishing), so check for actual cue rows
    // instead of a dedicated state that the transcript step no longer sets.
    if (
      project.state !== 'ready' &&
      project.state !== 'captions_ready' &&
      project.state !== 'failed'
    )
      throw new Error('The video must finish validating before rendering');
    const cueRows = await database.db
      .select({ count: sql<number>`count(*)::int` })
      .from(captionCues)
      .where(eq(captionCues.projectId, projectId));
    if (!cueRows[0]?.count)
      throw new Error('Captions must be generated before rendering');
    const correlationId = crypto.randomUUID(),
      bossJobId = await enqueueJob(
        'render-video',
        { userId: user.id, projectId, correlationId },
        { singletonKey: `render:${projectId}` }
      );
    await database.db.transaction(async (tx) => {
      await tx
        .update(videoProjects)
        .set({ state: 'rendering', updatedAt: new Date() })
        .where(
          and(
            eq(videoProjects.id, projectId),
            eq(videoProjects.userId, user.id)
          )
        );
      await tx.insert(backgroundJobs).values({
        userId: user.id,
        bossJobId,
        kind: 'render-video',
        resourceType: 'video_project',
        resourceId: projectId,
        state: 'queued',
        correlationId,
      });
    });
    return NextResponse.json(
      { projectId, state: 'rendering', bossJobId, correlationId },
      { status: 202 }
    );
  } catch (e) {
    return jsonError(e);
  } finally {
    await close?.();
  }
}
