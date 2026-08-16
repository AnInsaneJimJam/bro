import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import {
  createDatabase,
  publishJobs,
  socialPosts,
  videoProjects,
} from '@bro/db';
import { requireUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/http';

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    if (user.demo)
      return NextResponse.json(
        { error: 'Demo mode has no stored video to delete.' },
        { status: 409 }
      );
    const { projectId } = await context.params;
    z.string().uuid().parse(projectId);
    const database = createDatabase();
    close = database.close;
    const [project] = await database.db
      .select({
        originalKey: videoProjects.originalKey,
        renderedKey: videoProjects.renderedKey,
        metadata: videoProjects.metadata,
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
    const [job] = await database.db
      .select({ id: publishJobs.id })
      .from(publishJobs)
      .where(eq(publishJobs.projectId, projectId))
      .limit(1);
    const [post] = await database.db
      .select({ id: socialPosts.id })
      .from(socialPosts)
      .where(eq(socialPosts.projectId, projectId))
      .limit(1);
    if (job || post)
      throw Object.assign(
        new Error(
          'This video has scheduled or published jobs and cannot be deleted. Cancel any scheduled posts in Calendar first; a video that has already been published cannot be removed from Bro.'
        ),
        { status: 409 }
      );
    const admin = createSupabaseAdmin(),
      metadata = (project.metadata || {}) as {
        publishObjectKey?: string;
        audioObjectKey?: string;
      },
      warnings: string[] = [],
      removals = [
        {
          bucket: process.env.SUPABASE_ORIGINALS_BUCKET || 'bro-originals',
          keys: project.originalKey ? [project.originalKey] : [],
        },
        {
          bucket: process.env.SUPABASE_RENDERS_BUCKET || 'bro-renders',
          keys: [project.renderedKey, metadata.publishObjectKey].filter(
            (key): key is string => Boolean(key)
          ),
        },
        {
          bucket: process.env.SUPABASE_AUDIO_BUCKET || 'bro-audio',
          keys: metadata.audioObjectKey ? [metadata.audioObjectKey] : [],
        },
      ];
    for (const removal of removals)
      if (removal.keys.length) {
        const result = await admin.storage
          .from(removal.bucket)
          .remove(removal.keys);
        if (result.error)
          warnings.push(`${removal.bucket} cleanup: ${result.error.message}`);
      }
    await database.db
      .delete(videoProjects)
      .where(
        and(eq(videoProjects.id, projectId), eq(videoProjects.userId, user.id))
      );
    return NextResponse.json({ deleted: true, warnings });
  } catch (error) {
    return jsonError(error);
  } finally {
    await close?.();
  }
}
