import { NextResponse } from 'next/server';
import { z } from 'zod';
import { backgroundJobs, createDatabase } from '@bro/db';
import { requireUser } from '@/lib/auth';
import { enqueueJob } from '@/lib/jobs';
import { jsonError } from '@/lib/http';

const input = z.object({
  providers: z
    .array(z.enum(['youtube', 'instagram', 'reddit']))
    .min(1)
    .default(['youtube', 'instagram', 'reddit']),
});
export async function POST(request: Request) {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser(),
      body = input.parse(await request.json());
    if (user.demo)
      return NextResponse.json({
        mode: 'demo',
        queued: false,
        message: 'Demo source content is fixed and no live sync ran.',
      });
    const correlationId = crypto.randomUUID(),
      bossJobId = await enqueueJob(
        'sync-content',
        { userId: user.id, providers: body.providers, correlationId },
        { singletonKey: `sync-content:${user.id}` }
      );
    const database = createDatabase();
    close = database.close;
    await database.db.insert(backgroundJobs).values({
      userId: user.id,
      bossJobId,
      kind: 'sync-content',
      resourceType: 'creator_content',
      state: 'queued',
      correlationId,
    });
    return NextResponse.json(
      { queued: true, bossJobId, correlationId },
      { status: 202 }
    );
  } catch (error) {
    return jsonError(error);
  } finally {
    await close?.();
  }
}
