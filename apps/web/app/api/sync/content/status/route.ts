import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { backgroundJobs, createDatabase } from '@bro/db';
import { requireUser } from '@/lib/auth';
import { jsonError } from '@/lib/http';

const query = z.object({
  bossJobId: z.string().min(1).max(200),
  kind: z.enum(['sync-content', 'sync-comments']).default('sync-content'),
});

export async function GET(request: Request) {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    if (user.demo)
      return NextResponse.json({ mode: 'demo', state: 'completed' });
    const { bossJobId, kind } = query.parse(
      Object.fromEntries(new URL(request.url).searchParams)
    );
    const database = createDatabase();
    close = database.close;
    const [job] = await database.db
      .select({
        state: backgroundJobs.state,
        lastErrorCode: backgroundJobs.lastErrorCode,
        lastErrorMessage: backgroundJobs.lastErrorMessage,
        updatedAt: backgroundJobs.updatedAt,
      })
      .from(backgroundJobs)
      .where(
        and(
          eq(backgroundJobs.userId, user.id),
          eq(backgroundJobs.kind, kind),
          eq(backgroundJobs.bossJobId, bossJobId)
        )
      )
      .limit(1);
    if (!job)
      throw Object.assign(new Error('Sync job not found'), {
        status: 404,
      });
    return NextResponse.json(job);
  } catch (error) {
    return jsonError(error);
  } finally {
    await close?.();
  }
}
