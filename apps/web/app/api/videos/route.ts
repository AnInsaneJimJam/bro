import { NextResponse } from 'next/server';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { createDatabase, videoProjects } from '@bro/db';
import { requireUser } from '@/lib/auth';
import { jsonError } from '@/lib/http';
const create = z.object({
  scriptId: z.string().uuid().optional(),
  objectKey: z.string().min(1),
});
export async function GET(request: Request) {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser(),
      limit = Math.min(
        50,
        Math.max(
          1,
          Number(new URL(request.url).searchParams.get('limit') || 20)
        )
      );
    if (user.demo)
      return NextResponse.json([
        {
          id: '30000000-0000-4000-8000-000000000001',
          state: 'ready',
          metadata: { filename: 'ai-memory-demo-captioned.mp4' },
          demo: true,
        },
      ]);
    const database = createDatabase();
    close = database.close;
    return NextResponse.json(
      await database.db
        .select()
        .from(videoProjects)
        .where(eq(videoProjects.userId, user.id))
        .orderBy(desc(videoProjects.updatedAt))
        .limit(limit)
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
        { error: 'Demo mode cannot create a stored video project.' },
        { status: 409 }
      );
    if (
      !body.objectKey.startsWith(`${user.id}/`) ||
      body.objectKey.includes('..')
    )
      return NextResponse.json(
        { error: 'Object key is not owned by this user.' },
        { status: 403 }
      );
    const database = createDatabase();
    close = database.close;
    const [project] = await database.db
      .insert(videoProjects)
      .values({
        userId: user.id,
        scriptId: body.scriptId,
        originalKey: body.objectKey,
        state: 'uploaded',
      })
      .returning();
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    return jsonError(error);
  } finally {
    await close?.();
  }
}
