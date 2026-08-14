import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import {
  initialPublishState,
  schedulingIntentToUtc,
  validateConfirmationCard,
} from '@bro/core';
import {
  createDatabase,
  platformConnections,
  publishDestinations,
  publishJobs,
  scripts,
  users,
  videoProjects,
} from '@bro/db';
import { requireUser } from '@/lib/auth';
import { jsonError } from '@/lib/http';
import { queuePublish } from '@/lib/publish-queue';

const provider = z.enum(['youtube', 'instagram']);
const metadataSchema = z.object({
  youtube: z
    .object({
      title: z.string().min(1),
      description: z.string().default(''),
      visibility: z.enum(['public', 'unlisted', 'private']).default('public'),
    })
    .optional(),
  instagram: z.object({ caption: z.string().default('') }).optional(),
});
const input = z.object({
  projectId: z.string().uuid(),
  providers: z.array(provider).min(1).max(2),
  mode: z.enum(['now', 'schedule']),
  localDateTime: z.string().optional(),
  timeZone: z.string().min(3).optional(),
  metadata: metadataSchema.optional(),
});

export async function GET(request: Request) {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    if (user.demo) return NextResponse.json([]);
    const url = new URL(request.url),
      database = createDatabase();
    close = database.close;
    const conditions = [eq(publishJobs.userId, user.id)],
      from = url.searchParams.get('from'),
      to = url.searchParams.get('to');
    if (from) conditions.push(gte(publishJobs.scheduledAt, new Date(from)));
    if (to) conditions.push(lte(publishJobs.scheduledAt, new Date(to)));
    const jobs = await database.db
      .select()
      .from(publishJobs)
      .where(and(...conditions))
      .orderBy(desc(publishJobs.scheduledAt))
      .limit(100);
    return NextResponse.json(jobs);
  } catch (error) {
    return jsonError(error);
  } finally {
    await close?.();
  }
}

export async function POST(request: Request) {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    const body = input.parse(await request.json());
    if (user.demo) {
      const timeZone = body.timeZone || 'Asia/Kolkata';
      if (body.mode === 'schedule' && !body.localDateTime)
        throw new Error('Which local date and time should Bro schedule?');
      if (body.mode === 'schedule')
        schedulingIntentToUtc({
          localDateTime: body.localDateTime!,
          timeZone,
        });
      return NextResponse.json(
        {
          mode: 'demo',
          demo: true,
          requiresConfirmation: true,
          jobId: crypto.randomUUID(),
          card: validateConfirmationCard({
            projectId: body.projectId,
            mediaName: 'ai-memory-demo-captioned.mp4',
            providers: body.providers,
            title: body.metadata?.youtube?.title || 'AI memory workflow',
            caption:
              body.metadata?.instagram?.caption ||
              body.metadata?.youtube?.description ||
              'A clearly labeled Bro demo post.',
            scheduledAt:
              body.mode === 'schedule' ? body.localDateTime : 'Publish now',
            timeZone,
            visibility: body.metadata?.youtube?.visibility || 'public',
          }),
          notice:
            'Demo preview only. Confirming creates a browser-local calendar card and never calls a platform.',
        },
        { status: 202 }
      );
    }
    const database = createDatabase();
    close = database.close;
    const [[profile], [project], connections] = await Promise.all([
      database.db
        .select({
          youtube: users.autoPublishYoutube,
          instagram: users.autoPublishInstagram,
          timeZone: users.timeZone,
        })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1),
      database.db
        .select()
        .from(videoProjects)
        .where(
          and(
            eq(videoProjects.id, body.projectId),
            eq(videoProjects.userId, user.id)
          )
        )
        .limit(1),
      database.db
        .select({ provider: platformConnections.provider })
        .from(platformConnections)
        .where(
          and(
            eq(platformConnections.userId, user.id),
            eq(platformConnections.status, 'healthy'),
            inArray(platformConnections.provider, body.providers)
          )
        ),
    ]);
    if (!profile || !project?.originalKey || project.state !== 'ready')
      throw new Error('A validated, publish-ready video is required');
    const [script] = project.scriptId
      ? await database.db
          .select()
          .from(scripts)
          .where(
            and(eq(scripts.id, project.scriptId), eq(scripts.userId, user.id))
          )
          .limit(1)
      : [];
    const scriptMetadata = (script?.platformMetadata || {}) as {
      youtube?: {
        title?: string;
        description?: string;
        visibility?: 'public' | 'unlisted' | 'private';
      };
      instagram?: { caption?: string };
    };
    const metadata = metadataSchema.parse({
      youtube:
        body.metadata?.youtube ||
        (body.providers.includes('youtube')
          ? {
              title: scriptMetadata.youtube?.title || script?.title,
              description: scriptMetadata.youtube?.description || '',
              visibility: scriptMetadata.youtube?.visibility || 'public',
            }
          : undefined),
      instagram:
        body.metadata?.instagram ||
        (body.providers.includes('instagram')
          ? {
              caption: scriptMetadata.instagram?.caption || script?.title || '',
            }
          : undefined),
    });
    const timeZone = body.timeZone || profile.timeZone;
    if (!timeZone) throw new Error('Which IANA time zone should Bro use?');
    const connected = new Set(connections.map((item) => item.provider)),
      missing = body.providers.filter((item) => !connected.has(item));
    if (missing.length)
      throw new Error(`Connect ${missing.join(' and ')} before publishing`);
    for (const destination of body.providers)
      if (!metadata[destination])
        throw new Error(
          `${destination} metadata is required; attach this video to a script or edit platform metadata.`
        );
    let scheduledAt = new Date();
    if (body.mode === 'schedule') {
      if (!body.localDateTime)
        throw new Error('Which local date and time should Bro schedule?');
      scheduledAt = new Date(
        schedulingIntentToUtc({ localDateTime: body.localDateTime, timeZone })
          .scheduledAtUtc
      );
    }
    const autoPublish = {
        youtube: profile.youtube ?? false,
        instagram: profile.instagram ?? false,
      },
      policy = { autoPublish, providers: body.providers },
      jobId = crypto.randomUUID(),
      state = initialPublishState(policy),
      decisionSnapshot = {
        ...autoPublish,
        explicitlyConfirmed: false,
        createdFrom: body.mode,
      };
    await database.db.transaction(async (tx) => {
      await tx.insert(publishJobs).values({
        id: jobId,
        userId: user.id,
        projectId: body.projectId,
        scheduledAt,
        displayTimeZone: timeZone,
        state,
        idempotencyKey: crypto.randomUUID(),
        autoPublishSnapshot: decisionSnapshot,
      });
      await tx.insert(publishDestinations).values(
        body.providers.map((destination) => ({
          jobId,
          provider: destination,
          metadata: metadata[destination] || {},
          state,
          attemptCount: 0,
        }))
      );
    });
    if (state === 'awaiting_confirmation') {
      const youtube = metadata.youtube;
      return NextResponse.json(
        {
          requiresConfirmation: true,
          jobId,
          card: validateConfirmationCard({
            projectId: body.projectId,
            mediaName: String(
              (project.metadata as { filename?: string })?.filename ||
                'Rendered video'
            ),
            providers: body.providers,
            title: youtube?.title,
            caption: metadata.instagram?.caption || youtube?.description,
            scheduledAt:
              body.mode === 'schedule' ? body.localDateTime : 'Publish now',
            timeZone,
            visibility: youtube?.visibility || 'public',
          }),
        },
        { status: 202 }
      );
    }
    const queued = await queuePublish(database, {
      userId: user.id,
      jobId,
      projectId: body.projectId,
      providers: body.providers,
      scheduledAt,
      startAfter: body.mode === 'schedule' ? scheduledAt : undefined,
    });
    return NextResponse.json(
      {
        jobId,
        state: 'scheduled',
        scheduledAt: scheduledAt.toISOString(),
        timeZone,
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
