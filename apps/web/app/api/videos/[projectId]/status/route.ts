import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { createDatabase, videoProjects } from '@bro/db';
import { requireUser } from '@/lib/auth';
import { jsonError } from '@/lib/http';

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    if (user.demo)
      return NextResponse.json({
        project: {
          id: 'demo',
          state: 'ready',
          updatedAt: new Date().toISOString(),
        },
        demo: true,
      });
    const { projectId } = await context.params;
    z.string().uuid().parse(projectId);
    const database = createDatabase();
    close = database.close;
    const [row] = await database.db
      .select({
        id: videoProjects.id,
        state: videoProjects.state,
        updatedAt: videoProjects.updatedAt,
        metadata: videoProjects.metadata,
      })
      .from(videoProjects)
      .where(
        and(eq(videoProjects.id, projectId), eq(videoProjects.userId, user.id))
      )
      .limit(1);
    if (!row)
      throw Object.assign(new Error('Video project not found'), {
        status: 404,
      });
    const metadata = (row.metadata || {}) as {
      filename?: unknown;
      transcriptText?: unknown;
      transcriptionStatus?: unknown;
      transcriptionProvider?: unknown;
      aiMetadata?: unknown;
      metadataNotice?: unknown;
    };
    return NextResponse.json({
      project: {
        id: row.id,
        state: row.state,
        updatedAt: row.updatedAt,
        filename:
          typeof metadata.filename === 'string' ? metadata.filename : null,
        metadata: {
          hasTranscript:
            typeof metadata.transcriptText === 'string' &&
            metadata.transcriptText.trim().length > 0,
          transcriptionStatus:
            typeof metadata.transcriptionStatus === 'string'
              ? metadata.transcriptionStatus
              : null,
          transcriptionProvider:
            typeof metadata.transcriptionProvider === 'string'
              ? metadata.transcriptionProvider
              : null,
          aiMetadata: isVideoMetadata(metadata.aiMetadata)
            ? metadata.aiMetadata
            : null,
          notice:
            typeof metadata.metadataNotice === 'string'
              ? metadata.metadataNotice
              : null,
        },
      },
    });
  } catch (error) {
    return jsonError(error);
  } finally {
    await close?.();
  }
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
