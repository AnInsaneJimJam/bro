import { createDatabase } from './client';
import {
  captionCues,
  comments,
  creatorContentItems,
  nicheVersions,
  publishDestinations,
  publishJobs,
  scripts,
  scriptVersions,
  socialPosts,
  topicOpportunities,
  trendRuns,
  trendSignals,
  users,
  videoProjects,
} from './schema';

const ids = {
  user: '00000000-0000-4000-8000-000000000001',
  niche: '10000000-0000-4000-8000-000000000001',
  run: '11000000-0000-4000-8000-000000000001',
  signal: '12000000-0000-4000-8000-000000000001',
  topic: '20000000-0000-4000-8000-000000000001',
  script: '21000000-0000-4000-8000-000000000001',
  project: '30000000-0000-4000-8000-000000000001',
  job: '40000000-0000-4000-8000-000000000001',
  post: '50000000-0000-4000-8000-000000000001',
};
const database = createDatabase();
try {
  await database.db.transaction(async (tx) => {
    await tx
      .insert(users)
      .values({
        id: ids.user,
        displayName: 'Demo Creator',
        countryCode: 'IN',
        countryName: 'India',
        locale: 'en',
        timeZone: 'Asia/Kolkata',
        onboardingState: 'complete',
        autoPublishYoutube: false,
        autoPublishInstagram: false,
      })
      .onConflictDoNothing();
    await tx
      .insert(creatorContentItems)
      .values({
        userId: ids.user,
        provider: 'youtube',
        providerId: 'demo-owned-short-1',
        title: 'Three AI memory tricks',
        body: 'A practical creator workflow for persistent AI context.',
        metrics: { views: 1240, likes: 93 },
        publishedAt: new Date(Date.now() - 864e5),
        canonicalUrl: 'demo://youtube/demo-owned-short-1',
      })
      .onConflictDoNothing();
    await tx
      .insert(nicheVersions)
      .values({
        id: ids.niche,
        userId: ids.user,
        label: 'AI tools & productivity',
        subNiches: ['AI memory', 'creator workflows'],
        rationale:
          'Recent owned content repeatedly teaches practical AI workflows.',
        confidence: 0.86,
        evidence: [
          {
            platform: 'youtube',
            sourceId: 'demo-owned-short-1',
            excerpt: 'Three AI memory tricks',
            reason: 'Direct topic evidence',
          },
        ],
        sourceType: 'demo_seed',
        status: 'confirmed',
      })
      .onConflictDoNothing();
    await tx
      .insert(trendRuns)
      .values({
        id: ids.run,
        userId: ids.user,
        nicheVersionId: ids.niche,
        countryCode: 'IN',
        expiresAt: new Date(Date.now() + 6 * 3600e3),
        coverage: { youtube: 'demo data' },
        status: 'ready',
      })
      .onConflictDoNothing();
    await tx
      .insert(trendSignals)
      .values({
        id: ids.signal,
        runId: ids.run,
        source: 'youtube',
        sourceId: 'demo-signal-1',
        title: 'AI agents that remember your work',
        reference: 'demo://signal-1',
        metrics: { views: 8200 },
        observedAt: new Date(),
        scoreComponents: {
          recency: 1,
          velocity: 0.7,
          crossSource: 0,
          niche: 1,
          country: 1,
          score: 79,
        },
      })
      .onConflictDoNothing();
    await tx
      .insert(topicOpportunities)
      .values({
        id: ids.topic,
        runId: ids.run,
        topic: 'AI agents that remember your work',
        score: 79,
        breakdown: { recency: 25, niche: 30 },
        evidence: [{ signalId: ids.signal }],
        angle: 'Show a concrete memory workflow',
        hook: 'Your AI assistant forgets everything—and that costs hours.',
        caveat: 'Demo evidence from one source.',
      })
      .onConflictDoNothing();
    const script = {
      id: ids.script,
      userId: ids.user,
      topicId: ids.topic,
      title: 'The AI memory reset',
      duration: 45,
      hook: 'Your AI assistant forgets everything.',
      beats: [
        { label: 'Problem', spoken: 'Every new chat starts from zero.' },
        {
          label: 'Fix',
          spoken:
            'Store a compact project brief and retrieve it before each session.',
        },
      ],
      cta: 'Save this workflow.',
      platformMetadata: {
        youtube: {
          title: 'Fix AI memory in 45 seconds',
          description: 'A practical workflow.',
        },
        instagram: { caption: 'Stop rebuilding context.' },
      },
      currentVersion: 1,
    };
    await tx.insert(scripts).values(script).onConflictDoNothing();
    await tx
      .insert(scriptVersions)
      .values({ scriptId: ids.script, version: 1, snapshot: script })
      .onConflictDoNothing();
    await tx
      .insert(videoProjects)
      .values({
        id: ids.project,
        userId: ids.user,
        scriptId: ids.script,
        originalKey: 'demo/sample-video-reference.mp4',
        metadata: {
          filename: 'sample-video-reference.mp4',
          demoReference: true,
          duration: 4.4,
          width: 1080,
          height: 1920,
        },
        state: 'captions_ready',
      })
      .onConflictDoNothing();
    await tx
      .insert(captionCues)
      .values([
        {
          projectId: ids.project,
          text: 'Your AI assistant forgets everything',
          start: 0,
          end: 2.2,
          position: 0,
          style: {
            fontSize: 58,
            textColor: '#ffffff',
            outline: 4,
            verticalPosition: 'bottom',
          },
        },
        {
          projectId: ids.project,
          text: 'and that is costing you hours.',
          start: 2.2,
          end: 4.4,
          position: 1,
          style: {
            fontSize: 58,
            textColor: '#ffffff',
            outline: 4,
            verticalPosition: 'bottom',
          },
        },
      ])
      .onConflictDoNothing();
    await tx
      .insert(publishJobs)
      .values({
        id: ids.job,
        userId: ids.user,
        projectId: ids.project,
        scheduledAt: new Date(Date.now() + 864e5),
        displayTimeZone: 'Asia/Kolkata',
        state: 'scheduled',
        idempotencyKey: 'demo-scheduled-job',
        autoPublishSnapshot: {
          youtube: false,
          instagram: false,
          confirmed: true,
          demo: true,
        },
      })
      .onConflictDoNothing();
    await tx
      .insert(publishDestinations)
      .values([
        {
          jobId: ids.job,
          provider: 'youtube',
          metadata: { title: 'Demo scheduled post' },
          state: 'scheduled',
        },
        {
          jobId: ids.job,
          provider: 'instagram',
          metadata: { caption: 'Demo scheduled post' },
          state: 'scheduled',
        },
      ])
      .onConflictDoNothing();
    await tx
      .insert(socialPosts)
      .values({
        id: ids.post,
        userId: ids.user,
        projectId: ids.project,
        provider: 'youtube',
        providerMediaId: 'demo-owned-post-1',
        canonicalUrl: 'demo://youtube/demo-owned-post-1',
        publishedAt: new Date(Date.now() - 864e5),
        metrics: { views: 1240 },
      })
      .onConflictDoNothing();
    await tx
      .insert(comments)
      .values([
        {
          userId: ids.user,
          postId: ids.post,
          providerCommentId: 'demo-comment-1',
          authorRef: 'viewer-1',
          text: 'Where does it store the memory?',
          commentedAt: new Date(),
          likeCount: 4,
          syncedAt: new Date(),
          status: 'visible',
        },
        {
          userId: ids.user,
          postId: ids.post,
          providerCommentId: 'demo-comment-2',
          authorRef: 'viewer-2',
          text: 'This saved me so much setup time.',
          commentedAt: new Date(),
          likeCount: 9,
          syncedAt: new Date(),
          status: 'visible',
        },
      ])
      .onConflictDoNothing();
  });
  console.log('Seeded clearly labeled Bro demo records for user', ids.user);
} finally {
  await database.close();
}
