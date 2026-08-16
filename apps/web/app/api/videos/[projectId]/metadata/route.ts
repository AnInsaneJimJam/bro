import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { createDatabase, videoProjects } from '@bro/db';
import { generateStructuredText, videoMetadataOutput } from '@bro/ai';
import { requireUser } from '@/lib/auth';
import { jsonError } from '@/lib/http';
import { textProviderConfig } from '@/lib/text-ai';

export async function POST(
  _request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    if (user.demo)
      return NextResponse.json({
        projectId: 'demo',
        title: 'AI memory workflow: the part creators miss',
        description:
          'A practical AI memory workflow for creators. Try the system with one real task today.',
        instagramCaption:
          'The AI workflow that helps creators remember the work that matters. #AI #Creators #Shorts',
        generationNotice:
          'Demo draft — no video transcript was sent to a provider.',
      });
    const { projectId } = await context.params;
    z.string().uuid().parse(projectId);
    const database = createDatabase();
    close = database.close;
    const [project] = await database.db
      .select({
        id: videoProjects.id,
        state: videoProjects.state,
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
    const metadata = (project.metadata || {}) as Record<string, unknown>,
      transcript =
        typeof metadata.transcriptText === 'string'
          ? metadata.transcriptText.trim()
          : '';
    if (!transcript)
      throw Object.assign(
        new Error(
          'The video transcript is not ready yet. Bro will try again shortly.'
        ),
        { status: 409, code: 'VIDEO_TRANSCRIPT_NOT_READY' }
      );
    if (isVideoMetadata(metadata.aiMetadata))
      return NextResponse.json({
        projectId,
        ...metadata.aiMetadata,
        generationNotice:
          typeof metadata.metadataNotice === 'string'
            ? metadata.metadataNotice
            : undefined,
      });

    let draft: z.infer<typeof videoMetadataOutput>,
      generationNotice: string | undefined;
    try {
      draft = await generateStructuredText(textProviderConfig(), {
        schema: videoMetadataOutput,
        schemaName: 'video_metadata',
        system:
          'Create publishing metadata for an English YouTube Short and Instagram Reel from the supplied transcript only. Keep the YouTube title under 100 characters, make the description useful, and write a natural Instagram caption. Do not invent facts, sources, names, or current-trend claims that are not in the transcript.',
        user: JSON.stringify({ transcript }),
      });
    } catch {
      draft = deterministicMetadata(transcript);
      generationNotice =
        'The text model was unavailable, so Bro created a transparent draft directly from the transcript. Review it before publishing.';
    }
    await database.db
      .update(videoProjects)
      .set({
        metadata: {
          ...metadata,
          aiMetadata: draft,
          metadataNotice: generationNotice || null,
          metadataGeneratedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(
        and(eq(videoProjects.id, projectId), eq(videoProjects.userId, user.id))
      );
    return NextResponse.json({ projectId, ...draft, generationNotice });
  } catch (error) {
    return jsonError(error);
  } finally {
    await close?.();
  }
}

function deterministicMetadata(transcript: string) {
  const clean = transcript.replace(/\s+/g, ' ').trim(),
    firstSentence = clean.split(/[.!?](?:\s|$)/)[0]?.trim() || clean,
    words = firstSentence.split(/\s+/).filter(Boolean),
    title = titleCase(
      words.slice(0, 10).join(' ') || 'A practical creator idea'
    ).slice(0, 100),
    description = `${clean}\n\nWatch the Short for the full explanation.`.slice(
      0,
      5000
    ),
    instagramCaption = `${clean}\n\n#Shorts #Reels`.slice(0, 2200);
  return { title, description, instagramCaption };
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function isVideoMetadata(value: unknown): value is {
  title: string;
  description: string;
  instagramCaption: string;
} {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.title === 'string' &&
    typeof record.description === 'string' &&
    typeof record.instagramCaption === 'string'
  );
}
