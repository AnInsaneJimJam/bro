import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { createDatabase, videoProjects } from '@bro/db';
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
    if (project.state !== 'captions_ready' && project.state !== 'failed')
      throw new Error('Captions must be ready before rendering');
    await database.db
      .update(videoProjects)
      .set({ state: 'rendering', updatedAt: new Date() })
      .where(
        and(eq(videoProjects.id, projectId), eq(videoProjects.userId, user.id))
      );
    const correlationId = crypto.randomUUID(),
      bossJobId = await enqueueJob(
        'render-video',
        { userId: user.id, projectId, correlationId },
        { singletonKey: `render:${projectId}` }
      );
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
