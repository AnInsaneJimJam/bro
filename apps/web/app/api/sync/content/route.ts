import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { planConnectedProviderSync, type Provider } from '@bro/core';
import { backgroundJobs, createDatabase, platformConnections } from '@bro/db';
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
    const database = createDatabase();
    close = database.close;
    const connected = await database.db
        .select({ provider: platformConnections.provider })
        .from(platformConnections)
        .where(
          and(
            eq(platformConnections.userId, user.id),
            eq(platformConnections.status, 'healthy')
          )
        ),
      plan = planConnectedProviderSync(
        body.providers,
        connected.map((item) => item.provider as Provider)
      );
    if (!plan.providers.length)
      throw Object.assign(
        new Error(
          `None of the requested providers are connected. Connect ${plan.skipped.join(', ')} first.`
        ),
        { status: 409 }
      );
    const correlationId = crypto.randomUUID(),
      bossJobId = await enqueueJob(
        'sync-content',
        { userId: user.id, providers: plan.providers, correlationId },
        { singletonKey: `sync-content:${user.id}` }
      );
    await database.db.insert(backgroundJobs).values({
      userId: user.id,
      bossJobId,
      kind: 'sync-content',
      resourceType: 'creator_content',
      state: 'queued',
      correlationId,
    });
    return NextResponse.json(
      {
        queued: true,
        providers: plan.providers,
        skippedProviders: plan.skipped,
        bossJobId,
        correlationId,
      },
      { status: 202 }
    );
  } catch (error) {
    return jsonError(error);
  } finally {
    await close?.();
  }
}
