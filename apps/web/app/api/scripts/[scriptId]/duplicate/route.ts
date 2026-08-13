import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { createDatabase, scripts, scriptVersions } from '@bro/db';
import { requireUser } from '@/lib/auth';
import { jsonError } from '@/lib/http';

export async function POST(
  _request: Request,
  context: { params: Promise<{ scriptId: string }> }
) {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    if (user.demo)
      return NextResponse.json(
        {
          error:
            'Demo scripts can be created but duplication is not persisted.',
        },
        { status: 409 }
      );
    const { scriptId } = await context.params;
    z.string().uuid().parse(scriptId);
    const database = createDatabase();
    close = database.close;
    const [source] = await database.db
      .select()
      .from(scripts)
      .where(and(eq(scripts.id, scriptId), eq(scripts.userId, user.id)))
      .limit(1);
    if (!source)
      throw Object.assign(new Error('Owned script not found'), { status: 404 });
    const copy = await database.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(scripts)
        .values({
          userId: user.id,
          topicId: source.topicId,
          title: `${source.title || 'Untitled'} copy`,
          duration: source.duration,
          hook: source.hook,
          beats: source.beats,
          cta: source.cta,
          platformMetadata: source.platformMetadata,
          currentVersion: 1,
        })
        .returning();
      if (!created) throw new Error('Script duplication failed');
      await tx
        .insert(scriptVersions)
        .values({ scriptId: created.id, version: 1, snapshot: created });
      return created;
    });
    return NextResponse.json({ ...copy, version: 1 }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  } finally {
    await close?.();
  }
}
