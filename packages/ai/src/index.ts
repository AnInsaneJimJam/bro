import { z } from 'zod';
export * from './command';
export * from './transcription';
export * from './text-provider';
export * from './openrouter';
const id = z.string().uuid();
const providers = z
  .array(z.enum(['youtube', 'instagram']))
  .min(1)
  .refine((items) => new Set(items).size === items.length, {
    message: 'Each publishing destination may be selected only once.',
  });
const publishMetadata = z.object({
  youtube: z
    .object({
      title: z.string().min(1).max(100),
      description: z.string().max(5000).default(''),
      visibility: z.enum(['public', 'unlisted', 'private']).default('public'),
    })
    .optional(),
  instagram: z.object({ caption: z.string().max(2200).default('') }).optional(),
});
export const toolSchemas = {
  get_creator_profile: z.object({}),
  get_connection_status: z.object({
    provider: z.enum(['youtube', 'instagram', 'reddit']).optional(),
  }),
  sync_creator_content: z.object({
    providers: z.array(z.enum(['youtube', 'instagram', 'reddit'])).optional(),
  }),
  infer_creator_niche: z.object({ force: z.boolean().default(false) }),
  confirm_creator_niche: z.object({
    nicheVersionId: id,
    label: z.string().min(2),
    subNiches: z.array(z.string()).max(3),
  }),
  discover_topic_opportunities: z.object({
    count: z.number().int().min(5).max(10),
    countryCode: z.string().length(2),
  }),
  generate_short_script: z.object({
    // Use topicId for an opportunity from Bro's workspace. For a topic the
    // creator explicitly names that is not in the current opportunity list,
    // use topic instead and do not imply that it is a current trend.
    topicId: id.optional(),
    topic: z.string().min(2).max(240).optional(),
    durationSeconds: z.number().int().min(15).max(60),
    platforms: providers,
    angle: z.string().optional(),
  }),
  list_scripts: z.object({
    limit: z.number().int().min(1).max(50).default(20),
  }),
  create_video_project: z.object({
    scriptId: id.optional(),
    objectKey: z.string().min(1),
  }),
  list_video_projects: z.object({
    limit: z.number().int().min(1).max(50).default(20),
  }),
  transcribe_video_for_captions: z.object({ projectId: id }),
  render_captioned_video: z.object({ projectId: id }),
  publish_video_now: z.object({
    projectId: id,
    platforms: providers,
    metadata: publishMetadata,
  }),
  schedule_video_publish: z.object({
    projectId: id,
    platforms: providers,
    localDateTime: z.string(),
    timeZone: z.string(),
    metadata: publishMetadata,
  }),
  reschedule_publish_job: z.object({
    jobId: id,
    localDateTime: z.string(),
    timeZone: z.string(),
  }),
  cancel_publish_job: z.object({ jobId: id }),
  list_publish_jobs: z.object({
    from: z.string().optional(),
    to: z.string().optional(),
  }),
  sync_comments: z.object({ platforms: providers.optional() }),
  analyze_comments: z.object({
    platforms: providers.optional(),
    postIds: z.array(id).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    question: z.string().min(3),
  }),
} as const;
export type ToolName = keyof typeof toolSchemas;

// Kept in the schema registry so the editing slice can be re-enabled without
// changing the domain contract, but deliberately omitted from live model tool
// declarations until subtitle editing is ready for creators.
export const deferredVideoEditingTools = [
  'transcribe_video_for_captions',
  'render_captioned_video',
] as const satisfies readonly ToolName[];

export function isDeferredVideoEditingTool(name: string) {
  return (deferredVideoEditingTools as readonly string[]).includes(name);
}

export function liveToolNames() {
  return Object.keys(toolSchemas).filter(
    (name): name is ToolName => !isDeferredVideoEditingTool(name)
  );
}

export function validateToolCall(name: string, args: unknown) {
  const schema = toolSchemas[name as ToolName];
  if (!schema) throw new Error(`Unknown tool ${name}`);
  return schema.parse(args);
}
export const nicheOutput = z.object({
  primaryNiche: z.string(),
  subNiches: z.array(z.string()).max(3),
  rationale: z.string(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(
    z.object({
      platform: z.enum(['youtube', 'instagram', 'reddit']),
      sourceId: z.string(),
      excerpt: z.string(),
      reason: z.string(),
    })
  ),
  insufficientData: z.boolean(),
});
export const shortScriptOutput = z.object({
  workingTitle: z.string(),
  targetPlatforms: providers,
  targetDuration: z.number().min(15).max(60),
  hook: z.string(),
  beats: z.array(
    z.object({
      label: z.string(),
      spoken: z.string(),
      onScreenText: z.string().optional(),
    })
  ),
  cta: z.string(),
  youtube: z
    .object({
      title: z.string(),
      description: z.string(),
      hashtags: z.array(z.string()),
    })
    .optional(),
  instagram: z
    .object({ caption: z.string(), hashtags: z.array(z.string()) })
    .optional(),
  sourceReferences: z.array(z.string()),
  estimatedDuration: z.number(),
});
export const topicOpportunityOutput = z.object({
  items: z
    .array(
      z.object({
        topic: z.string().min(2),
        reason: z.string(),
        evidenceIds: z.array(z.string()).min(1),
        suggestedAngle: z.string(),
        potentialHook: z.string(),
        caveat: z.string().nullable(),
      })
    )
    .min(1)
    .max(10),
});
export const commentAnalysisOutput = z.object({
  summary: z.string(),
  themes: z.array(z.string()),
  sentiment: z.object({
    positive: z.number().min(0),
    neutral: z.number().min(0),
    negative: z.number().min(0),
    note: z.string(),
  }),
  frequentlyAskedQuestions: z.array(z.string()),
  confusionOrObjections: z.array(z.string()),
  futureContentRequests: z.array(z.string()),
  representativeComments: z.array(
    z.object({ commentId: z.string().uuid(), whyRepresentative: z.string() })
  ),
});
export const videoMetadataOutput = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(5000),
  instagramCaption: z.string().max(2200),
});
