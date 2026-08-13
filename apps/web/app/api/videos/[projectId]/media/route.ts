import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { createDatabase, videoProjects } from '@bro/db';
import { requireUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/http';

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    if (user.demo)
      return NextResponse.json({
        demo: true,
        url: null,
        message:
          'Demo media is a reference only; no fake signed URL is returned.',
      });
    const { projectId } = await context.params;
    z.string().uuid().parse(projectId);
    const rendered =
      new URL(request.url).searchParams.get('variant') === 'rendered';
    const database = createDatabase();
    close = database.close;
    const [project] = await database.db
      .select({
        originalKey: videoProjects.originalKey,
        renderedKey: videoProjects.renderedKey,
      })
      .from(videoProjects)
      .where(
        and(eq(videoProjects.id, projectId), eq(videoProjects.userId, user.id))
      )
      .limit(1);
    if (!project)
      throw Object.assign(new Error('Video project not found'), {
        status: 404,
      });
    const key = rendered ? project.renderedKey : project.originalKey;
    if (!key)
      throw Object.assign(
        new Error(`${rendered ? 'Rendered' : 'Original'} media is not ready`),
        { status: 409 }
      );
    const bucket = rendered
      ? process.env.SUPABASE_RENDERS_BUCKET || 'bro-renders'
      : process.env.SUPABASE_ORIGINALS_BUCKET || 'bro-originals';
    const { data, error } = await createSupabaseAdmin()
      .storage.from(bucket)
      .createSignedUrl(key, 300);
    if (error || !data?.signedUrl)
      throw Object.assign(
        new Error(error?.message || 'Could not sign private media'),
        { status: 502 }
      );
    return NextResponse.json({
      url: data.signedUrl,
      expiresInSeconds: 300,
      variant: rendered ? 'rendered' : 'original',
    });
  } catch (error) {
    return jsonError(error);
  } finally {
    await close?.();
  }
}
