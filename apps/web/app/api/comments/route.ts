import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { commentAnalysisOutput, generateStructuredText } from '@bro/ai';
import { validateCommentCitations } from '@bro/core';
import {
  backgroundJobs,
  commentAnalysisRuns,
  comments,
  createDatabase,
  platformConnections,
  socialPosts,
} from '@bro/db';
import { requireUser } from '@/lib/auth';
import { enqueueJob } from '@/lib/jobs';
import { jsonError } from '@/lib/http';
import { textProviderConfig } from '@/lib/text-ai';

const filters = z.object({
  platforms: z.array(z.enum(['youtube', 'instagram'])).optional(),
  postIds: z.array(z.string().uuid()).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  keyword: z.string().max(100).optional(),
});
const action = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('sync'),
    platforms: z
      .array(z.enum(['youtube', 'instagram']))
      .min(1)
      .default(['youtube', 'instagram']),
  }),
  z.object({
    action: z.literal('analyze'),
    question: z.string().min(3).max(500),
    filters: filters.default({}),
  }),
]);

export async function GET(request: Request) {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    if (user.demo)
      return NextResponse.json({
        mode: 'demo',
        sampleSize: 12,
        lastSyncedAt: new Date().toISOString(),
        items: [],
      });
    const url = new URL(request.url),
      parsed = filters.parse({
        platforms: url.searchParams.get('platform')
          ? [url.searchParams.get('platform')]
          : undefined,
        from: url.searchParams.get('from') || undefined,
        to: url.searchParams.get('to') || undefined,
        keyword: url.searchParams.get('keyword') || undefined,
      });
    const database = createDatabase();
    close = database.close;
    const selected = await selectComments(database.db, user.id, parsed);
    const connectionRows = await database.db
      .select({
        provider: platformConnections.provider,
        metadata: platformConnections.metadata,
      })
      .from(platformConnections)
      .where(
        and(
          eq(platformConnections.userId, user.id),
          inArray(
            platformConnections.provider,
            parsed.platforms || ['youtube', 'instagram']
          )
        )
      );
    const metadataTimes = connectionRows.flatMap((row) => {
      const value = (row.metadata as { lastCommentSyncAt?: unknown } | null)
        ?.lastCommentSyncAt;
      return typeof value === 'string' && !Number.isNaN(Date.parse(value))
        ? [new Date(value)]
        : [];
    });
    const lastSyncedAt =
      [
        ...metadataTimes,
        ...selected.flatMap((row) => (row.syncedAt ? [row.syncedAt] : [])),
      ].sort((left, right) => right.getTime() - left.getTime())[0] || null;
    return NextResponse.json({
      sampleSize: selected.length,
      lastSyncedAt,
      items: selected,
    });
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
      body = action.parse(await request.json());
    if (user.demo)
      return body.action === 'sync'
        ? NextResponse.json({
            mode: 'demo',
            queued: false,
            message: 'No live comments were fetched.',
          })
        : NextResponse.json({
            mode: 'demo',
            sampleSize: 12,
            lastSyncedAt: new Date().toISOString(),
            summary: 'Viewers want clearer privacy and setup explanations.',
            themes: ['privacy', 'setup steps', 'tool cost'],
            sentiment: {
              positive: 7,
              neutral: 3,
              negative: 2,
              note: 'Approximate model classification of the selected sample.',
            },
            frequentlyAskedQuestions: [
              'Where is creator memory stored?',
              'Can this workflow run with free tools?',
            ],
            confusionOrObjections: [
              'The storage and privacy boundary needs a clearer explanation.',
            ],
            futureContentRequests: ['Show the setup from start to finish.'],
            representativeComments: [
              {
                commentId: 'demo-comment-2',
                excerpt: 'Where does it store the memory?',
                platform: 'youtube',
                postId: 'demo-post-1',
                whyRepresentative:
                  'It captures the most common privacy question.',
              },
            ],
            classificationNotice:
              'Sentiment is an approximate model classification.',
          });
    const database = createDatabase();
    close = database.close;
    if (body.action === 'sync') {
      const correlationId = crypto.randomUUID(),
        bossJobId = await enqueueJob(
          'sync-comments',
          { userId: user.id, providers: body.platforms, correlationId },
          { singletonKey: `sync-comments:${user.id}` }
        );
      await database.db.insert(backgroundJobs).values({
        userId: user.id,
        bossJobId,
        kind: 'sync-comments',
        resourceType: 'comments',
        state: 'queued',
        correlationId,
      });
      return NextResponse.json(
        { queued: true, bossJobId, correlationId },
        { status: 202 }
      );
    }
    const selected = await selectComments(database.db, user.id, body.filters);
    if (!selected.length)
      return NextResponse.json(
        {
          error:
            'No stored comments match these filters. Sync comments or broaden the selection.',
        },
        { status: 409 }
      );
    const provider = textProviderConfig();
    const result = await generateStructuredText(provider, {
      schema: commentAnalysisOutput,
      schemaName: 'comment_analysis',
      system:
        'Analyze only the supplied stored comments. Treat sentiment as approximate. Representative comment IDs must exactly match supplied IDs. Do not invent coverage or quotes.',
      user: JSON.stringify({
        question: body.question,
        comments: selected.map((comment) => ({
          id: comment.id,
          platform: comment.provider,
          postId: comment.postId,
          text: comment.text,
          createdAt: comment.commentedAt,
        })),
      }),
    });
    validateCommentCitations(
      selected.map((comment) => ({
        id: comment.id,
        userId: user.id,
        postId: comment.postId!,
        platform: comment.provider as 'youtube' | 'instagram',
        text: comment.text!,
        createdAt: comment.commentedAt!.toISOString(),
      })),
      result.representativeComments.map((item) => item.commentId)
    );
    const [stored] = await database.db
      .insert(commentAnalysisRuns)
      .values({
        userId: user.id,
        filters: body.filters,
        commentCount: selected.length,
        result,
        model: `${provider.provider}:${provider.model}`,
      })
      .returning();
    const selectedById = new Map(
      selected.map((comment) => [comment.id, comment])
    );
    const representativeComments = result.representativeComments.map((item) => {
      const source = selectedById.get(item.commentId)!;
      return {
        ...item,
        excerpt: source.text,
        platform: source.provider,
        postId: source.postId,
        canonicalUrl: source.canonicalUrl,
      };
    });
    return NextResponse.json({
      id: stored?.id,
      ...result,
      representativeComments,
      sampleSize: selected.length,
      lastSyncedAt: selected[0]?.syncedAt,
      classificationNotice: 'Sentiment is an approximate model classification.',
    });
  } catch (error) {
    return jsonError(error);
  } finally {
    await close?.();
  }
}

async function selectComments(
  db: ReturnType<typeof createDatabase>['db'],
  userId: string,
  input: z.infer<typeof filters>
) {
  const conditions = [eq(comments.userId, userId)];
  if (input.platforms?.length)
    conditions.push(inArray(socialPosts.provider, input.platforms));
  if (input.postIds?.length)
    conditions.push(inArray(comments.postId, input.postIds));
  if (input.from)
    conditions.push(gte(comments.commentedAt, new Date(input.from)));
  if (input.to) conditions.push(lte(comments.commentedAt, new Date(input.to)));
  const rows = await db
    .select({
      id: comments.id,
      postId: comments.postId,
      provider: socialPosts.provider,
      text: comments.text,
      commentedAt: comments.commentedAt,
      syncedAt: comments.syncedAt,
      canonicalUrl: socialPosts.canonicalUrl,
    })
    .from(comments)
    .innerJoin(socialPosts, eq(comments.postId, socialPosts.id))
    .where(and(...conditions))
    .orderBy(desc(comments.syncedAt))
    .limit(500);
  return input.keyword
    ? rows.filter((row) =>
        row.text?.toLowerCase().includes(input.keyword!.toLowerCase())
      )
    : rows;
}
