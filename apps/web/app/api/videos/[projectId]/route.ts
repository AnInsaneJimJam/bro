import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import {
  createDatabase,
  publishJobs,
  socialPosts,
  videoProjects,
} from '@bro/db';
import { requireUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/http';

// Jobs still in flight; deleting the video out from under one of these would
// strand a scheduled post or an in-progress/retryable upload with no media.
// A job in any other state (published, partially_published, failed_permanent,
// cancelled) is finished, so it no longer needs the local video to exist.
const activePublishStates = [
  'awaiting_confirmation',
  'scheduled',
  'processing',
  'uploading',
  'failed_retryable',
];

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
    const [activeJob] = await database.db
      .select({ id: publishJobs.id })
      .from(publishJobs)
      .where(
        and(
          eq(publishJobs.projectId, projectId),
          inArray(publishJobs.state, activePublishStates)
        )
      )
      .limit(1);
    if (activeJob)
      throw Object.assign(
        new Error(
          'This video has a scheduled or in-progress publish job. Cancel it in Calendar (or wait for it to finish) before deleting.'
        ),
        { status: 409 }
      );
    // Finished jobs and their social posts are real history (and comments
    // reference the post) — detach them from the video instead of blocking
    // deletion or deleting those records. publishJobs.projectId has no
    // cascade, so it must be cleared before the video row can go.
    await database.db
      .update(publishJobs)
      .set({ projectId: null })
      .where(eq(publishJobs.projectId, projectId));
    await database.db
      .update(socialPosts)
      .set({ projectId: null })
      .where(eq(socialPosts.projectId, projectId));
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
