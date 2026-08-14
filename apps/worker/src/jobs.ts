import { z } from 'zod';
export const jobSchemas = {
  'sync-content': z.object({
    userId: z.string().uuid(),
    providers: z.array(z.enum(['youtube', 'instagram', 'reddit'])),
    correlationId: z.string(),
  }),
  'validate-video': z.object({
    userId: z.string().uuid(),
    projectId: z.string().uuid(),
    originalObjectKey: z.string(),
    correlationId: z.string(),
  }),
  'transcribe-video': z.object({
    userId: z.string().uuid(),
    projectId: z.string().uuid(),
    originalObjectKey: z.string(),
    correlationId: z.string(),
  }),
  'render-video': z.object({
    userId: z.string().uuid(),
    projectId: z.string().uuid(),
    correlationId: z.string(),
  }),
  'publish-video': z.object({
    userId: z.string().uuid(),
    publishJobId: z.string().uuid(),
    providers: z.array(z.enum(['youtube', 'instagram'])),
    correlationId: z.string(),
  }),
  'sync-comments': z.object({
    userId: z.string().uuid(),
    providers: z.array(z.enum(['youtube', 'instagram'])),
    correlationId: z.string(),
  }),
  'refresh-recent-comments': z.object({ correlationId: z.string() }),
} as const;
export type JobName = keyof typeof jobSchemas;
export type JobHandlers = {
  [K in JobName]: (data: z.infer<(typeof jobSchemas)[K]>) => Promise<unknown>;
};
export function validateJob<K extends JobName>(name: K, data: unknown) {
  return jobSchemas[name].parse(data);
}
