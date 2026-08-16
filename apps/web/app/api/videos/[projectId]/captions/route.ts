import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import { captionCues, createDatabase, videoProjects } from '@bro/db';
import { validateCues } from '@bro/video';
import { requireUser } from '@/lib/auth';
import { jsonError } from '@/lib/http';
const cue = z.object({
    text: z.string().min(1).max(180),
    start: z.number().min(0),
    end: z.number().positive(),
    style: z.record(z.unknown()).optional(),
  }),
  update = z.object({
    expectedUpdatedAt: z.string().datetime(),
    cues: z.array(cue).min(1).max(300),
  });
export async function GET(
  _req: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    if (user.demo)
      return NextResponse.json({
        project: {
          id: 'demo',
          state: 'captions_ready',
          updatedAt: new Date().toISOString(),
        },
        cues: [
          {
            text: 'Your AI assistant forgets everything',
            start: 0,
            end: 2.2,
            position: 0,
          },
          {
            text: 'and that is costing you hours.',
            start: 2.2,
            end: 4.4,
            position: 1,
          },
        ],
        demo: true,
      });
    const { projectId } = await context.params;
    z.string().uuid().parse(projectId);
    const database = createDatabase();
    close = database.close;
    const [project] = await database.db
      .select({
        id: videoProjects.id,
        state: videoProjects.state,
        updatedAt: videoProjects.updatedAt,
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
    const cues = await database.db
      .select()
      .from(captionCues)
      .where(eq(captionCues.projectId, projectId))
      .orderBy(asc(captionCues.position));
    return NextResponse.json({ project, cues });
  } catch (e) {
    return jsonError(e);
  } finally {
    await close?.();
  }
}
export async function PATCH(
  req: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    if (user.demo)
      return NextResponse.json(
        {
          error:
            'Demo caption edits are local UI state and are not represented as persisted data.',
        },
        { status: 409 }
      );
    const { projectId } = await context.params,
      data = update.parse(await req.json());
    try {
      validateCues(data.cues);
    } catch {
      // Cue timing is read-only in the editor, so an overlap here is never
      // something the creator did — it's leftover from an older transcript
      // pass generated before cue timing was corrected at the source.
      throw Object.assign(
        new Error(
          'These captions have an internal timing conflict from an earlier transcript pass. Use "Retry transcription & captions" on the Upload page to regenerate them, then try saving again.'
        ),
        { status: 409 }
      );
    }
    const database = createDatabase();
    close = database.close;
    const changed = await database.db.transaction(async (tx) => {
      const [locked] = await tx
        .update(videoProjects)
        .set({ updatedAt: new Date() })
        .where(
          and(
            eq(videoProjects.id, projectId),
            eq(videoProjects.userId, user.id),
            eq(videoProjects.updatedAt, new Date(data.expectedUpdatedAt))
          )
        )
        .returning({ updatedAt: videoProjects.updatedAt });
      if (!locked) return null;
      await tx.delete(captionCues).where(eq(captionCues.projectId, projectId));
      await tx.insert(captionCues).values(
        data.cues.map((item, position) => ({
          projectId,
          text: item.text,
          start: item.start,
          end: item.end,
          position,
          style: item.style || {},
        }))
      );
      return locked;
    });
    if (!changed)
      return NextResponse.json(
        {
          error: 'Captions changed in another session. Refresh before saving.',
        },
        { status: 409 }
      );
    return NextResponse.json({ saved: true, updatedAt: changed.updatedAt });
  } catch (e) {
    return jsonError(e);
  } finally {
    await close?.();
  }
}
