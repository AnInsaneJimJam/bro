import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createDatabase, videoProjects } from '@bro/db';
import { requireUser } from '@/lib/auth';
import { enqueueJob } from '@/lib/jobs';
import { jsonError } from '@/lib/http';
import { sanitizeUploadFilename } from '@bro/video';
const input = z.object({
  projectId: z.string().uuid(),
  objectKey: z.string().min(1),
  filename: z.string().min(1),
  mimeType: z.string().startsWith('video/'),
  size: z.number().int().positive(),
});
export async function POST(req: Request) {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    if (user.demo)
      return NextResponse.json(
        { error: 'Demo mode has no uploaded storage object to finalize.' },
        { status: 409 }
      );
    const body = input.parse(await req.json()),
      safe = sanitizeUploadFilename(body.filename),
      expected = `${user.id}/${body.projectId}/original/`;
    if (!body.objectKey.startsWith(expected) || body.objectKey.includes('..'))
      throw Object.assign(
        new Error('Upload object does not belong to this user and project'),
        { status: 403 }
      );
    const database = createDatabase();
    close = database.close;
    await database.db
      .insert(videoProjects)
      .values({
        id: body.projectId,
        userId: user.id,
        originalKey: body.objectKey,
        state: 'queued',
        metadata: { filename: safe, mimeType: body.mimeType, size: body.size },
      })
      .onConflictDoNothing({ target: videoProjects.id });
    const correlationId = crypto.randomUUID(),
      bossJobId = await enqueueJob(
        'validate-video',
        {
          userId: user.id,
          projectId: body.projectId,
          originalObjectKey: body.objectKey,
          correlationId,
        },
        { singletonKey: `validate:${body.projectId}` }
      );
    return NextResponse.json(
      { projectId: body.projectId, state: 'queued', bossJobId, correlationId },
      { status: 202 }
    );
  } catch (e) {
    return jsonError(e);
  } finally {
    await close?.();
  }
}
