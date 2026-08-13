import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
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
        { error: 'Demo mode does not run synthetic transcription.' },
        { status: 409 }
      );
    const { projectId } = await context.params;
    z.string().uuid().parse(projectId);
    const database = createDatabase();
    close = database.close;
    const [project] = await database.db
      .select()
      .from(videoProjects)
      .where(
        and(eq(videoProjects.id, projectId), eq(videoProjects.userId, user.id))
      )
      .limit(1);
    if (!project?.originalKey)
      throw Object.assign(new Error('Owned uploaded video not found'), {
        status: 404,
      });
    await database.db
      .update(videoProjects)
      .set({ state: 'queued', updatedAt: new Date() })
      .where(
        and(eq(videoProjects.id, projectId), eq(videoProjects.userId, user.id))
      );
    const correlationId = crypto.randomUUID(),
      bossJobId = await enqueueJob(
        'transcribe-video',
        {
          userId: user.id,
          projectId,
          originalObjectKey: project.originalKey,
          correlationId,
        },
        { singletonKey: `transcribe:${projectId}` }
      );
    await database.db.insert(backgroundJobs).values({
      userId: user.id,
      bossJobId,
      kind: 'transcribe-video',
      resourceType: 'video_project',
      resourceId: projectId,
      state: 'queued',
      correlationId,
    });
    return NextResponse.json(
      { projectId, state: 'queued', bossJobId, correlationId },
      { status: 202 }
    );
  } catch (error) {
    return jsonError(error);
  } finally {
    await close?.();
  }
}
