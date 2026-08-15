import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, desc, eq, gt } from 'drizzle-orm';
import { scoreTrend } from '@bro/core';
import { generateStructuredText, topicOpportunityOutput } from '@bro/ai';
import {
  createDatabase,
  nicheVersions,
  platformConnections,
  topicOpportunities,
  trendRuns,
  trendSignals,
  users,
} from '@bro/db';
import {
  RedditAdapter,
  YouTubeAdapter,
  type TrendSignal,
} from '@bro/integrations';
import { requireUser } from '@/lib/auth';
import { demoStore } from '@/lib/demo-store';
import { jsonError } from '@/lib/http';
import { accessToken } from '@/lib/provider-token';
import { textProviderConfig } from '@/lib/text-ai';

export async function GET(request: Request) {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    const count = Math.min(
      10,
      Math.max(5, Number(new URL(request.url).searchParams.get('count') || 5))
    );
    if (user.demo)
      return NextResponse.json({
        generatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 6 * 3600e3).toISOString(),
        items: demoStore.opportunities(count),
        mode: 'demo',
      });
    const database = createDatabase();
    close = database.close;
    const rows = await database.db
      .select({
        id: topicOpportunities.id,
        topic: topicOpportunities.topic,
        score: topicOpportunities.score,
        breakdown: topicOpportunities.breakdown,
        evidence: topicOpportunities.evidence,
        angle: topicOpportunities.angle,
        hook: topicOpportunities.hook,
        caveat: topicOpportunities.caveat,
        generatedAt: trendRuns.createdAt,
        expiresAt: trendRuns.expiresAt,
        countryCode: trendRuns.countryCode,
      })
      .from(topicOpportunities)
      .innerJoin(trendRuns, eq(topicOpportunities.runId, trendRuns.id))
      .where(
        and(
          eq(trendRuns.userId, user.id),
          eq(trendRuns.status, 'ready'),
          gt(trendRuns.expiresAt, new Date())
        )
      )
      .orderBy(desc(topicOpportunities.score))
      .limit(count);
    const first = rows[0];
    if (!first)
      return NextResponse.json(
        {
          error:
            'No fresh evidence-backed opportunity run exists. Refresh signals after confirming a niche.',
        },
        { status: 409 }
      );
    return NextResponse.json({
      generatedAt: first.generatedAt,
      expiresAt: first.expiresAt,
      country: first.countryCode,
      items: rows.map((row) => ({
        ...row,
        reason: row.angle,
        freshness: row.generatedAt,
      })),
    });
  } catch (error) {
    return jsonError(error);
  } finally {
    await close?.();
  }
}

const refreshSchema = z.object({
  count: z.number().int().min(5).max(10).default(5),
  countryCode: z.string().length(2).optional(),
});
export async function POST(request: Request) {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser(),
      body = refreshSchema.parse(await request.json());
    if (user.demo)
      return NextResponse.json({
        generatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 6 * 3600e3).toISOString(),
        items: demoStore.opportunities(body.count),
        mode: 'demo',
      });
    const keyRaw = process.env.TOKEN_ENCRYPTION_KEY;
    if (!keyRaw)
      throw Object.assign(new Error('Token encryption is not configured'), {
        status: 503,
      });
    const database = createDatabase();
    close = database.close;
    const [[profile], [niche]] = await Promise.all([
      database.db
        .select({ countryCode: users.countryCode })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1),
      database.db
        .select()
        .from(nicheVersions)
        .where(
          and(
            eq(nicheVersions.userId, user.id),
            eq(nicheVersions.status, 'confirmed')
          )
        )
        .orderBy(desc(nicheVersions.updatedAt))
        .limit(1),
    ]);
    if (!niche)
      return NextResponse.json(
        {
          error: 'Confirm or edit your niche before refreshing opportunities.',
        },
        { status: 409 }
      );
    const countryCode = body.countryCode || profile?.countryCode;
    if (!countryCode)
      return NextResponse.json(
        { error: 'Select a country before refreshing opportunities.' },
        { status: 409 }
      );
    const encryptionKey = Buffer.from(keyRaw, 'base64'),
      since = new Date(Date.now() - 7 * 86400e3).toISOString(),
      coverage: Record<string, string> = {
        instagram:
          'omitted: official discovery signal unavailable for this account/API configuration',
      };
    const signals: TrendSignal[] = [];
    for (const provider of ['youtube', 'reddit'] as const) {
      if (
        provider === 'reddit' &&
        process.env.REDDIT_INTEGRATION_ENABLED !== 'true'
      ) {
        coverage.reddit =
          'omitted: feature flag disabled pending approved API access';
        continue;
      }
      const [connection] = await database.db
        .select()
        .from(platformConnections)
        .where(
          and(
            eq(platformConnections.userId, user.id),
            eq(platformConnections.provider, provider)
          )
        )
        .limit(1);
      if (!connection) {
        coverage[provider] = 'omitted: not connected';
        continue;
      }
      const token = async () =>
        accessToken(database, connection, encryptionKey);
      const adapter =
        provider === 'youtube'
          ? new YouTubeAdapter(token)
          : new RedditAdapter(
              token,
              true,
              process.env.REDDIT_USER_AGENT || 'bro-mvp'
            );
      try {
        const found = await adapter.discover({
          niche: niche.label,
          countryCode,
          since,
        });
        signals.push(...found);
        coverage[provider] = `${found.length} official signals`;
      } catch (error) {
        coverage[provider] =
          `unavailable: ${error instanceof Error ? error.message : 'provider error'}`;
      }
    }
    if (!signals.length)
      return NextResponse.json(
        {
          error:
            'No official, time-bounded signals were available. Bro will not invent current trends.',
          coverage,
        },
        { status: 409 }
      );
    const nicheTokens = tokens(niche.label),
      now = Date.now();
    const scored = signals.map((signal) => {
      const titleTokens = tokens(signal.title),
        recency = Math.max(
          0,
          1 - (now - Date.parse(signal.observedAt)) / (7 * 86400e3)
        ),
        velocity = Math.min(
          1,
          Math.log1p(
            Object.values(signal.metrics).reduce(
              (sum, value) => sum + Math.max(0, value),
              0
            )
          ) / 12
        ),
        crossSource = signals.some(
          (other) =>
            other.provider !== signal.provider &&
            overlap(titleTokens, tokens(other.title)) >= 0.25
        )
          ? 1
          : 0,
        nicheRelevance = Math.max(0.2, overlap(titleTokens, nicheTokens)),
        countryRelevance = signal.provider === 'youtube' ? 1 : 0.35,
        components = {
          recency,
          velocity,
          crossSource,
          niche: nicheRelevance,
          country: countryRelevance,
        };
      return { ...signal, components, score: scoreTrend(components) };
    });
    // Twenty-five raw search results plus metrics are unnecessary context for
    // a small card-clustering task. Keep all official signals for storage and
    // scoring, but send only the strongest twelve to the model.
    const modelSignals = scored
      .slice()
      .sort((left, right) => right.score - left.score)
      .slice(0, 12);
    let clustered: z.infer<typeof topicOpportunityOutput>;
    try {
      clustered = await generateStructuredText(textProviderConfig(), {
        schema: topicOpportunityOutput,
        schemaName: 'topic_opportunities',
        system: `Cluster near-duplicate creator topic signals into ${body.count} or fewer useful English opportunity cards. Use only supplied signal IDs as evidence. State a caveat for single-source or weak evidence.`,
        user: JSON.stringify({
          niche: niche.label,
          countryCode,
          signals: modelSignals,
        }),
      });
      coverage.ai = 'OpenRouter structured clustering';
    } catch (error) {
      // Official signals are still useful without an available model. Return
      // transparent, one-signal-per-card opportunities rather than making the
      // creator wait for the Railway request deadline or inventing a trend.
      coverage.ai = `unavailable: ${safeAiError(error)}; deterministic signal cards used`;
      clustered = deterministicCards(modelSignals, body.count, niche.label);
    }
    const allowed = new Set(modelSignals.map((signal) => signal.externalId));
    for (const item of clustered.items)
      if (item.evidenceIds.some((id) => !allowed.has(id)))
        throw Object.assign(
          new Error('Opportunity result cited a signal outside this run'),
          { status: 502 }
        );
    const expiresAt = new Date(Date.now() + 6 * 3600e3);
    const result = await database.db.transaction(async (tx) => {
      const [run] = await tx
        .insert(trendRuns)
        .values({
          userId: user.id,
          nicheVersionId: niche.id,
          countryCode,
          expiresAt,
          coverage,
          status: 'ready',
        })
        .returning();
      if (!run) throw new Error('Trend run insert failed');
      const storedSignals = await tx
        .insert(trendSignals)
        .values(
          scored.map((signal) => ({
            runId: run.id,
            source: signal.provider,
            sourceId: signal.externalId,
            title: signal.title,
            reference: signal.reference,
            metrics: signal.metrics,
            observedAt: new Date(signal.observedAt),
            scoreComponents: { ...signal.components, score: signal.score },
          }))
        )
        .returning();
      const byExternal = new Map(
        storedSignals.map((item) => [item.sourceId, item])
      );
      const cards = await tx
        .insert(topicOpportunities)
        .values(
          clustered.items.slice(0, body.count).map((item) => {
            const evidence = item.evidenceIds
              .map((id) => byExternal.get(id))
              .filter(Boolean)
              .map((signal) => ({
                signalId: signal!.id,
                source: signal!.source,
                reference: signal!.reference,
                observedAt: signal!.observedAt,
              }));
            const evidenceScores = item.evidenceIds.map(
              (id) =>
                scored.find((signal) => signal.externalId === id)?.score || 0
            );
            const score = Math.round(
              evidenceScores.reduce((sum, value) => sum + value, 0) /
                evidenceScores.length
            );
            return {
              runId: run.id,
              topic: item.topic,
              score,
              breakdown: { evidenceScores },
              evidence,
              angle: item.suggestedAngle,
              hook: item.potentialHook,
              caveat:
                item.caveat ||
                (new Set(evidence.map((entry) => entry.source)).size < 2
                  ? 'Evidence currently comes from one official source.'
                  : null),
            };
          })
        )
        .returning();
      return { run, cards };
    });
    return NextResponse.json(
      {
        generatedAt: result.run.createdAt,
        expiresAt,
        country: countryCode,
        coverage,
        items: result.cards.map((card) => ({
          ...card,
          reason: card.angle,
          freshness: result.run.createdAt,
        })),
      },
      { status: 201 }
    );
  } catch (error) {
    return jsonError(error);
  } finally {
    await close?.();
  }
}

function tokens(value: string) {
  return new Set(value.toLowerCase().match(/[a-z0-9]+/g) || []);
}
function overlap(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const value of left) if (right.has(value)) common++;
  return common / Math.max(left.size, right.size);
}

function safeAiError(error: unknown) {
  const value = error as { status?: number; code?: string };
  if (value?.code === 'AI_PROVIDER_TIMEOUT' || value?.status === 504)
    return 'AI provider timeout';
  if (value?.status === 429) return 'AI provider rate limit';
  return 'AI clustering failed';
}

function deterministicCards(
  signals: Array<TrendSignal & { score: number }>,
  count: number,
  niche: string
): z.infer<typeof topicOpportunityOutput> {
  return {
    items: signals.slice(0, count).map((signal) => ({
      topic: signal.title.trim().slice(0, 240) || `${niche} opportunity`,
      reason:
        'This is a recent official signal matching the confirmed niche and selected country.',
      evidenceIds: [signal.externalId],
      suggestedAngle: `Explain the practical takeaway for creators interested in ${niche}.`,
      potentialHook:
        'This topic is showing up right now—here is what creators should know.',
      caveat:
        'AI clustering was unavailable; this card is a direct single-source signal.',
    })),
  };
}
