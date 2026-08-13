import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  real,
  boolean,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
const id = () => uuid('id').defaultRandom().primaryKey(),
  times = {
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  };
export const users = pgTable('users', {
  id: id(),
  displayName: text('display_name'),
  countryCode: text('country_code'),
  countryName: text('country_name'),
  locale: text('locale').default('en'),
  timeZone: text('time_zone'),
  onboardingState: text('onboarding_state').default('profile'),
  autoPublishYoutube: boolean('auto_publish_youtube').default(false),
  autoPublishInstagram: boolean('auto_publish_instagram').default(false),
  ...times,
});
export const platformConnections = pgTable(
  'platform_connections',
  {
    id: id(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    providerAccountName: text('provider_account_name'),
    encryptedAccessToken: jsonb('encrypted_access_token').notNull(),
    encryptedRefreshToken: jsonb('encrypted_refresh_token'),
    scopes: text('scopes').array(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    status: text('status').default('healthy'),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    metadata: jsonb('metadata').default({}),
    ...times,
  },
  (t) => [uniqueIndex('one_connection_per_provider').on(t.userId, t.provider)]
);
export const creatorContentItems = pgTable(
  'creator_content_items',
  {
    id: id(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    provider: text('provider').notNull(),
    providerId: text('provider_id').notNull(),
    title: text('title'),
    body: text('body'),
    metrics: jsonb('metrics').default({}),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    canonicalUrl: text('canonical_url'),
    syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow(),
    ...times,
  },
  (t) => [
    uniqueIndex('content_provider_id').on(t.userId, t.provider, t.providerId),
  ]
);
export const nicheVersions = pgTable('niche_versions', {
  id: id(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  label: text('label').notNull(),
  subNiches: jsonb('sub_niches').default([]),
  rationale: text('rationale'),
  confidence: real('confidence'),
  evidence: jsonb('evidence').default([]),
  sourceType: text('source_type'),
  status: text('status').default('proposed'),
  ...times,
});
export const trendRuns = pgTable('trend_runs', {
  id: id(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  nicheVersionId: uuid('niche_version_id').references(() => nicheVersions.id),
  countryCode: text('country_code'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  coverage: jsonb('coverage'),
  status: text('status'),
  ...times,
});
export const trendSignals = pgTable('trend_signals', {
  id: id(),
  runId: uuid('run_id').references(() => trendRuns.id, { onDelete: 'cascade' }),
  source: text('source'),
  sourceId: text('source_id'),
  title: text('title'),
  body: text('body'),
  reference: text('reference'),
  metrics: jsonb('metrics'),
  observedAt: timestamp('observed_at', { withTimezone: true }),
  scoreComponents: jsonb('score_components'),
  ...times,
});
export const topicOpportunities = pgTable('topic_opportunities', {
  id: id(),
  runId: uuid('run_id').references(() => trendRuns.id, { onDelete: 'cascade' }),
  topic: text('topic'),
  score: integer('score'),
  breakdown: jsonb('breakdown'),
  evidence: jsonb('evidence'),
  angle: text('angle'),
  hook: text('hook'),
  caveat: text('caveat'),
  ...times,
});
export const scripts = pgTable('scripts', {
  id: id(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  topicId: uuid('topic_id').references(() => topicOpportunities.id),
  title: text('title'),
  duration: integer('duration'),
  hook: text('hook'),
  beats: jsonb('beats'),
  cta: text('cta'),
  platformMetadata: jsonb('platform_metadata'),
  currentVersion: integer('current_version').default(1),
  ...times,
});
export const scriptVersions = pgTable(
  'script_versions',
  {
    id: id(),
    scriptId: uuid('script_id').references(() => scripts.id, {
      onDelete: 'cascade',
    }),
    version: integer('version'),
    snapshot: jsonb('snapshot'),
    ...times,
  },
  (t) => [uniqueIndex('script_version_unique').on(t.scriptId, t.version)]
);
export const videoProjects = pgTable('video_projects', {
  id: id(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  scriptId: uuid('script_id').references(() => scripts.id),
  originalKey: text('original_key'),
  renderedKey: text('rendered_key'),
  metadata: jsonb('metadata'),
  state: text('state').default('uploaded'),
  ...times,
});
export const transcriptWords = pgTable(
  'transcript_words',
  {
    id: id(),
    projectId: uuid('project_id').references(() => videoProjects.id, {
      onDelete: 'cascade',
    }),
    text: text('text'),
    start: real('start'),
    end: real('end'),
    confidence: real('confidence'),
    position: integer('position'),
  },
  (t) => [index('words_project_position').on(t.projectId, t.position)]
);
export const captionCues = pgTable('caption_cues', {
  id: id(),
  projectId: uuid('project_id').references(() => videoProjects.id, {
    onDelete: 'cascade',
  }),
  text: text('text'),
  start: real('start'),
  end: real('end'),
  position: integer('position'),
  style: jsonb('style'),
});
export const publishJobs = pgTable('publish_jobs', {
  id: id(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  projectId: uuid('project_id').references(() => videoProjects.id),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  displayTimeZone: text('display_time_zone'),
  state: text('state'),
  idempotencyKey: text('idempotency_key').unique(),
  autoPublishSnapshot: jsonb('auto_publish_snapshot'),
  ...times,
});
export const publishDestinations = pgTable(
  'publish_destinations',
  {
    id: id(),
    jobId: uuid('job_id').references(() => publishJobs.id, {
      onDelete: 'cascade',
    }),
    provider: text('provider'),
    metadata: jsonb('metadata'),
    state: text('state'),
    attemptCount: integer('attempt_count').default(0),
    externalId: text('external_id'),
    url: text('url'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    ...times,
  },
  (t) => [uniqueIndex('job_destination_unique').on(t.jobId, t.provider)]
);
export const socialPosts = pgTable(
  'social_posts',
  {
    id: id(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => videoProjects.id),
    provider: text('provider'),
    providerMediaId: text('provider_media_id'),
    canonicalUrl: text('canonical_url'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    metrics: jsonb('metrics'),
    ...times,
  },
  (t) => [
    uniqueIndex('post_provider_unique').on(
      t.userId,
      t.provider,
      t.providerMediaId
    ),
  ]
);
export const comments = pgTable(
  'comments',
  {
    id: id(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    postId: uuid('post_id').references(() => socialPosts.id, {
      onDelete: 'cascade',
    }),
    providerCommentId: text('provider_comment_id'),
    parentId: text('parent_id'),
    authorRef: text('author_ref'),
    text: text('text'),
    commentedAt: timestamp('commented_at', { withTimezone: true }),
    likeCount: integer('like_count'),
    syncedAt: timestamp('synced_at', { withTimezone: true }),
    status: text('status'),
    ...times,
  },
  (t) => [
    uniqueIndex('comment_provider_unique').on(t.postId, t.providerCommentId),
  ]
);
export const commentAnalysisRuns = pgTable('comment_analysis_runs', {
  id: id(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  filters: jsonb('filters'),
  commentCount: integer('comment_count'),
  result: jsonb('result'),
  model: text('model'),
  ...times,
});
export const chatThreads = pgTable('chat_threads', {
  id: id(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  title: text('title'),
  ...times,
});
export const chatMessages = pgTable('chat_messages', {
  id: id(),
  threadId: uuid('thread_id').references(() => chatThreads.id, {
    onDelete: 'cascade',
  }),
  role: text('role'),
  content: text('content'),
  toolSummary: jsonb('tool_summary'),
  ...times,
});
export const agentToolRuns = pgTable('agent_tool_runs', {
  id: id(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  toolName: text('tool_name'),
  arguments: jsonb('arguments'),
  status: text('status'),
  resultSummary: jsonb('result_summary'),
  correlationId: text('correlation_id'),
  ...times,
});
export const backgroundJobs = pgTable(
  'background_jobs',
  {
    id: id(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    bossJobId: text('boss_job_id').unique(),
    kind: text('kind').notNull(),
    resourceType: text('resource_type'),
    resourceId: uuid('resource_id'),
    state: text('state').default('queued'),
    attemptCount: integer('attempt_count').default(0),
    lastErrorCode: text('last_error_code'),
    lastErrorMessage: text('last_error_message'),
    correlationId: text('correlation_id'),
    ...times,
  },
  (t) => [index('background_jobs_user_state').on(t.userId, t.state)]
);
export const auditEvents = pgTable('audit_events', {
  id: id(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  action: text('action'),
  resource: text('resource'),
  outcome: text('outcome'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
