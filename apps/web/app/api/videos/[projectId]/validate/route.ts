import { NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { backgroundJobs, createDatabase, videoProjects } from '@bro/db';
import { requireUser } from '@/lib/auth';
import { enqueueJob } from '@/lib/jobs';
import { jsonError } from '@/lib/http';

export async function POST(
  _request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    if (user.demo)
      return NextResponse.json(
        { error: 'Demo data has no stored validation job to retry.' },
        { status: 409 }
      );
    const { projectId } = await context.params;
    z.string().uuid().parse(projectId);
    const database = createDatabase();
    close = database.close;
    const [project] = await database.db
      .select({
        id: videoProjects.id,
        originalKey: videoProjects.originalKey,
        state: videoProjects.state,
      })
      .from(videoProjects)
      .where(
        and(eq(videoProjects.id, projectId), eq(videoProjects.userId, user.id))
      )
      .limit(1);
    if (!project?.originalKey)
      throw Object.assign(new Error('Owned uploaded video not found'), {
        status: 404,
      });
    if (project.state === 'ready')
      return NextResponse.json({ projectId, state: 'ready', queued: false });
    const existing = await database.db
      .select({
        bossJobId: backgroundJobs.bossJobId,
        state: backgroundJobs.state,
      })
      .from(backgroundJobs)
      .where(
        and(
          eq(backgroundJobs.userId, user.id),
          eq(backgroundJobs.resourceId, projectId),
          eq(backgroundJobs.kind, 'validate-video'),
          inArray(backgroundJobs.state, ['queued', 'processing'])
        )
      )
      .limit(1);
    if (existing[0])
      return NextResponse.json({
        projectId,
        state: project.state,
        queued: true,
        bossJobId: existing[0].bossJobId,
      });
    await database.db
      .update(videoProjects)
      .set({ state: 'queued', updatedAt: new Date() })
      .where(
        and(eq(videoProjects.id, projectId), eq(videoProjects.userId, user.id))
      );
    const correlationId = crypto.randomUUID();
    const bossJobId = await enqueueJob(
      'validate-video',
      {
        userId: user.id,
        projectId,
        originalObjectKey: project.originalKey,
        correlationId,
      },
      { singletonKey: `validate:${projectId}` }
    );
    await database.db.insert(backgroundJobs).values({
      userId: user.id,
      bossJobId,
      kind: 'validate-video',
      resourceType: 'video_project',
      resourceId: projectId,
      state: 'queued',
      correlationId,
    });
    return NextResponse.json(
      { projectId, state: 'queued', queued: true, bossJobId, correlationId },
      { status: 202 }
    );
  } catch (error) {
    return jsonError(error);
  } finally {
    await close?.();
  }
}
