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
  topicId: z.string().uuid(),
  duration: z.number().int().min(15).max(60),
  angle: z.string().max(500).optional(),
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
    if (user.demo)
      return NextResponse.json(
        demoStore.generateScript(body.topicId, body.duration, body.angle),
        { status: 201 }
      );
    const database = createDatabase();
    close = database.close;
    const [topic] = await database.db
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
          eq(topicOpportunities.id, body.topicId),
          eq(trendRuns.userId, user.id)
        )
      )
      .limit(1);
    if (!topic)
      throw Object.assign(new Error('Owned topic opportunity not found'), {
        status: 404,
      });
    const result = await generateStructuredText(textProviderConfig('script'), {
      schema: shortScriptOutput,
      schemaName: 'short_script',
      system:
        'Write a concise English vertical short-form video script. Stay grounded in the supplied opportunity references and meet the requested duration. Return platform metadata only for requested platforms.',
      user: JSON.stringify({
        ...topic,
        targetDuration: body.duration,
        platforms: body.platforms,
        requestedAngle: body.angle,
      }),
    });
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
      { ...saved, version: saved.currentVersion },
      { status: 201 }
    );
  } catch (error) {
    return jsonError(error);
  } finally {
    await close?.();
  }
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
