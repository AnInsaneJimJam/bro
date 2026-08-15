import { NextResponse } from 'next/server';
import { and, asc, desc, eq, gt, inArray } from 'drizzle-orm';
import {
  backgroundJobs,
  createDatabase,
  nicheVersions,
  platformConnections,
  publishJobs,
  scripts,
  topicOpportunities,
  trendRuns,
  users,
} from '@bro/db';
import { requireUser } from '@/lib/auth';
import { jsonError } from '@/lib/http';

export async function GET() {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    if (user.demo)
      return NextResponse.json({
        mode: 'demo',
        profile: {
          displayName: 'Creator',
          countryName: 'India',
          countryCode: 'IN',
          timeZone: 'Asia/Kolkata',
        },
        niche: { label: 'AI tools & productivity' },
        opportunities: [
          {
            id: '1',
            topic: 'AI agents that remember your work',
            angle: 'A practical memory workflow for busy creators.',
            score: 86,
            createdAt: new Date(Date.now() - 3600e3),
          },
          {
            id: '2',
            topic: 'Turn voice notes into a second brain',
            angle: 'A 45-second build with familiar tools.',
            score: 74,
            createdAt: new Date(Date.now() - 4 * 3600e3),
          },
          {
            id: '3',
            topic: 'Why most AI productivity systems fail',
            angle: 'A contrarian creator-discussion angle.',
            score: 63,
            createdAt: new Date(Date.now() - 11 * 3600e3),
          },
        ],
        script: {
          id: 'demo',
          title: 'AI agents that remember your work',
          currentVersion: 1,
        },
        nextJob: {
          id: 'demo',
          scheduledAt: new Date(Date.now() + 864e5),
          state: 'scheduled',
        },
        connections: [
          {
            provider: 'youtube',
            accountName: '@creatorbro',
            status: 'healthy',
          },
          {
            provider: 'instagram',
            accountName: '@creatorbro_in',
            status: 'healthy',
          },
          {
            provider: 'reddit',
            accountName: 'u/creatorbro_in',
            status: 'demo',
          },
        ],
        failedJobs: [
          {
            id: 'demo',
            resourceId: null,
            kind: 'publish-video',
            state: 'failed_retryable',
            lastErrorMessage: 'YouTube upload failed',
            updatedAt: new Date(),
          },
        ],
      });
    const database = createDatabase();
    close = database.close;
    // OAuth creates the Supabase auth identity before the Bro profile is
    // necessarily saved. Keep a nullable shell row so every user-scoped
    // foreign key and home read has a valid owner on first login.
    await database.db
      .insert(users)
      .values({ id: user.id })
      .onConflictDoNothing({ target: users.id });
    const now = new Date();
    const [
      [profile],
      [niche],
      opportunities,
      [script],
      [nextJob],
      connections,
      failedJobs,
    ] = await Promise.all([
      database.db
        .select({
          displayName: users.displayName,
          countryName: users.countryName,
          countryCode: users.countryCode,
          timeZone: users.timeZone,
        })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1),
      database.db
        .select({ label: nicheVersions.label })
        .from(nicheVersions)
        .where(
          and(
            eq(nicheVersions.userId, user.id),
            eq(nicheVersions.status, 'confirmed')
          )
        )
        .orderBy(desc(nicheVersions.updatedAt))
        .limit(1),
      database.db
        .select({
          id: topicOpportunities.id,
          topic: topicOpportunities.topic,
          angle: topicOpportunities.angle,
          score: topicOpportunities.score,
          createdAt: topicOpportunities.createdAt,
        })
        .from(topicOpportunities)
        .innerJoin(trendRuns, eq(topicOpportunities.runId, trendRuns.id))
        .where(and(eq(trendRuns.userId, user.id), gt(trendRuns.expiresAt, now)))
        .orderBy(desc(topicOpportunities.score))
        .limit(3),
      database.db
        .select({
          id: scripts.id,
          title: scripts.title,
          currentVersion: scripts.currentVersion,
        })
        .from(scripts)
        .where(eq(scripts.userId, user.id))
        .orderBy(desc(scripts.updatedAt))
        .limit(1),
      database.db
        .select({
          id: publishJobs.id,
          scheduledAt: publishJobs.scheduledAt,
          state: publishJobs.state,
        })
        .from(publishJobs)
        .where(
          and(
            eq(publishJobs.userId, user.id),
            gt(publishJobs.scheduledAt, now),
            inArray(publishJobs.state, ['scheduled', 'awaiting_confirmation'])
          )
        )
        .orderBy(asc(publishJobs.scheduledAt))
        .limit(1),
      database.db
        .select({
          provider: platformConnections.provider,
          accountName: platformConnections.providerAccountName,
          status: platformConnections.status,
          lastSyncAt: platformConnections.lastSyncAt,
        })
        .from(platformConnections)
        .where(eq(platformConnections.userId, user.id)),
      database.db
        .select({
          id: backgroundJobs.id,
          resourceId: backgroundJobs.resourceId,
          kind: backgroundJobs.kind,
          state: backgroundJobs.state,
          lastErrorMessage: backgroundJobs.lastErrorMessage,
          updatedAt: backgroundJobs.updatedAt,
        })
        .from(backgroundJobs)
        .where(
          and(
            eq(backgroundJobs.userId, user.id),
            inArray(backgroundJobs.state, [
              'failed_retryable',
              'failed_permanent',
            ])
          )
        )
        .orderBy(desc(backgroundJobs.updatedAt))
        .limit(5),
    ]);
    return NextResponse.json({
      mode: 'live',
      profile,
      niche,
      opportunities,
      script,
      nextJob,
      connections,
      failedJobs,
    });
  } catch (error) {
    return jsonError(error);
  } finally {
    await close?.();
  }
}
