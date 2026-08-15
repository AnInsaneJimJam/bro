import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { generateStructuredText, shortScriptOutput } from '@bro/ai';
import {
  createDatabase,
  scripts,
  scriptVersions,
  topicOpportunities,
  trendRuns,
} from '@bro/db';
import { requireUser } from '@/lib/auth';
import { demoStore } from '@/lib/demo-store';
import { jsonError } from '@/lib/http';
import { textProviderConfig } from '@/lib/text-ai';

const create = z.object({
  topicId: z.string().uuid().optional(),
  topic: z.string().trim().min(2).max(240).optional(),
  duration: z.number().int().min(15).max(60),
  angle: z.string().trim().max(500).optional(),
  platforms: z
    .array(z.enum(['youtube', 'instagram']))
    .min(1)
    .default(['youtube', 'instagram']),
});
const patchSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  hook: z.string().min(1).max(1000).optional(),
  beats: z
    .array(
      z.object({
        label: z.string(),
        spoken: z.string(),
        onScreenText: z.string().optional(),
      })
    )
    .optional(),
  cta: z.string().max(1000).optional(),
});
const update = z.object({
  id: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  patch: patchSchema,
});

export async function GET() {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    if (user.demo) return NextResponse.json(demoStore.listScripts());
    const database = createDatabase();
    close = database.close;
    return NextResponse.json(
      await database.db
        .select()
        .from(scripts)
        .where(eq(scripts.userId, user.id))
        .orderBy(desc(scripts.updatedAt))
        .limit(50)
    );
  } catch (error) {
    return jsonError(error);
  } finally {
    await close?.();
  }
}

export async function POST(request: Request) {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser(),
      body = create.parse(await request.json());
    if (!body.topicId && !body.topic)
      throw Object.assign(
        new Error(
          'Choose a topic opportunity or name the topic you want Bro to write about.'
        ),
        { status: 400, code: 'SCRIPT_TOPIC_REQUIRED' }
      );
    if (user.demo)
      return NextResponse.json(
        body.topicId
          ? demoStore.generateScript(body.topicId, body.duration, body.angle)
          : demoStore.generateCustomScript(body.topic!, body.duration, body.angle),
        { status: 201 }
      );
    const database = createDatabase();
    close = database.close;
    const topic = body.topicId
      ? await findOwnedOpportunity(database.db, user.id, body.topicId)
      : {
          id: null,
          topic: body.topic!,
          angle: body.angle || null,
          hook: null,
          evidence: [],
        };
    if (!topic)
      throw Object.assign(new Error('Owned topic opportunity not found'), {
        status: 404,
      });
    let result: z.infer<typeof shortScriptOutput>,
      generationNotice: string | undefined;
    try {
      result = await generateStructuredText(textProviderConfig('script'), {
        schema: shortScriptOutput,
        schemaName: 'short_script',
        system:
          `Write a concise English vertical short-form video script and meet the requested duration. ${topic.id ? 'Stay grounded in the supplied opportunity references.' : 'This is an evergreen creator-supplied topic, not a live trend; do not invent current evidence or claim it is trending.'} Return platform metadata only for requested platforms.`,
        user: JSON.stringify({
          ...topic,
          topicSource: topic.id ? 'workspace_opportunity' : 'creator_supplied',
          targetDuration: body.duration,
          platforms: body.platforms,
          requestedAngle: body.angle,
        }),
      });
    } catch (error) {
      if (!isAiFallbackEligible(error)) throw error;
      result = deterministicScript(topic, body);
      generationNotice =
        `The AI provider was unavailable, so Bro saved a transparent quick draft from the ${topic.id ? 'selected opportunity' : 'creator-supplied topic'}. You can edit it now or retry later for an AI rewrite.`;
    }
    if (!topic.id) result = { ...result, sourceReferences: [] };
    const saved = await database.db.transaction(async (tx) => {
      const [script] = await tx
        .insert(scripts)
        .values({
          userId: user.id,
          topicId: topic.id,
          title: result.workingTitle,
          duration: result.targetDuration,
          hook: result.hook,
          beats: result.beats,
          cta: result.cta,
          platformMetadata: {
            youtube: result.youtube,
            instagram: result.instagram,
            sourceReferences: result.sourceReferences,
            estimatedDuration: result.estimatedDuration,
            topicSource: topic.id ? 'workspace_opportunity' : 'creator_supplied',
            creatorTopic: topic.id ? undefined : topic.topic,
          },
          currentVersion: 1,
        })
        .returning();
      if (!script) throw new Error('Script insert returned no record');
      await tx
        .insert(scriptVersions)
        .values({ scriptId: script.id, version: 1, snapshot: script });
      return script;
    });
    return NextResponse.json(
      { ...saved, version: saved.currentVersion, generationNotice },
      { status: 201 }
    );
  } catch (error) {
    return jsonError(error);
  } finally {
    await close?.();
  }
}

async function findOwnedOpportunity(
  database: ReturnType<typeof createDatabase>['db'],
  userId: string,
  topicId: string
) {
  const [topic] = await database
    .select({
      id: topicOpportunities.id,
      topic: topicOpportunities.topic,
      angle: topicOpportunities.angle,
      hook: topicOpportunities.hook,
      evidence: topicOpportunities.evidence,
    })
    .from(topicOpportunities)
    .innerJoin(trendRuns, eq(topicOpportunities.runId, trendRuns.id))
    .where(
      and(
        eq(topicOpportunities.id, topicId),
        eq(trendRuns.userId, userId)
      )
    )
    .limit(1);
  return topic;
}

function isAiFallbackEligible(error: unknown) {
  const value = error as { status?: number; code?: string };
  return (
    value?.code === 'AI_PROVIDER_TIMEOUT' ||
    value?.status === 429 ||
    (typeof value?.status === 'number' && value.status >= 500)
  );
}

function deterministicScript(
  topic: {
    topic: string | null;
    angle: string | null;
    hook: string | null;
    evidence: unknown;
  },
  body: z.infer<typeof create>
): z.infer<typeof shortScriptOutput> {
  const title = topic.topic?.trim() || 'A timely creator topic',
    angle =
      body.angle?.trim() ||
      topic.angle?.trim() ||
      'Explain the practical takeaway and show one concrete example.',
    hook =
      topic.hook?.trim() ||
      body.angle?.trim() ||
      `Most creators are missing this about ${title}.`,
    references = Array.isArray(topic.evidence)
      ? topic.evidence.flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const reference = (item as { reference?: unknown }).reference;
          return typeof reference === 'string' ? [reference] : [];
        })
      : [],
    beats = [
      { label: 'Hook', spoken: hook },
      { label: 'Context', spoken: `Here is what is happening: ${title}.` },
      { label: 'Takeaway', spoken: angle },
      {
        label: 'CTA',
        spoken:
          'Save this idea, and follow for more practical creator workflows.',
      },
    ],
    youtube = body.platforms.includes('youtube')
      ? {
          title: title.slice(0, 100),
          description: `${angle}\n\nSource: ${references.join(', ')}`.slice(
            0,
            5000
          ),
          hashtags: ['#Shorts'],
        }
      : undefined,
    instagram = body.platforms.includes('instagram')
      ? {
          caption: `${hook}\n\n${angle}`.slice(0, 2200),
          hashtags: ['#Reels'],
        }
      : undefined;
  return {
    workingTitle: title,
    targetPlatforms: body.platforms,
    targetDuration: body.duration,
    hook,
    beats,
    cta: beats[beats.length - 1]!.spoken,
    youtube,
    instagram,
    sourceReferences: references,
    estimatedDuration: body.duration,
  };
}

export async function PATCH(request: Request) {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser(),
      body = update.parse(await request.json());
    if (user.demo)
      return NextResponse.json(
        demoStore.updateScript(body.id, body.expectedVersion, body.patch)
      );
    const database = createDatabase();
    close = database.close;
    const saved = await database.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(scripts)
        .where(
          and(
            eq(scripts.id, body.id),
            eq(scripts.userId, user.id),
            eq(scripts.currentVersion, body.expectedVersion)
          )
        )
        .limit(1);
      if (!current)
        throw Object.assign(
          new Error(
            'Script changed in another session or is not owned by this user.'
          ),
          { status: 409 }
        );
      const nextVersion = body.expectedVersion + 1;
      const [next] = await tx
        .update(scripts)
        .set({
          ...body.patch,
          currentVersion: nextVersion,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(scripts.id, body.id),
            eq(scripts.userId, user.id),
            eq(scripts.currentVersion, body.expectedVersion)
          )
        )
        .returning();
      if (!next)
        throw Object.assign(new Error('Script changed in another session.'), {
          status: 409,
        });
      await tx
        .insert(scriptVersions)
        .values({ scriptId: body.id, version: nextVersion, snapshot: next });
      return next;
    });
    return NextResponse.json({ ...saved, version: saved.currentVersion });
  } catch (error) {
    return jsonError(error);
  } finally {
    await close?.();
  }
}
