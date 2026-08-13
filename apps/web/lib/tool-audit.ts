import { redactSecrets } from '@bro/core';
import { agentToolRuns, auditEvents, type createDatabase } from '@bro/db';
import type { ToolName } from '@bro/ai';

export async function executeAuditedTool(input: {
  database: ReturnType<typeof createDatabase>;
  userId: string;
  name: ToolName;
  args: Record<string, unknown>;
  callId?: string;
  execute: () => Promise<unknown>;
}) {
  const correlationId = input.callId || crypto.randomUUID();
  const [run] = await input.database.db
    .insert(agentToolRuns)
    .values({
      userId: input.userId,
      toolName: input.name,
      arguments: redactSecrets(input.args),
      status: 'running',
      correlationId,
    })
    .returning({ id: agentToolRuns.id });
  try {
    const result = await input.execute(),
      summary = summarizeResult(result);
    if (run)
      await input.database.db
        .update(agentToolRuns)
        .set({
          status: 'completed',
          resultSummary: redactSecrets(summary),
          updatedAt: new Date(),
        })
        .where(eq(agentToolRuns.id, run.id));
    await input.database.db.insert(auditEvents).values({
      userId: input.userId,
      action: `tool.${input.name}`,
      resource: run?.id || correlationId,
      outcome: 'completed',
      metadata: { correlationId },
    });
    return result;
  } catch (error) {
    const safe = {
      error:
        error instanceof Error
          ? error.message.slice(0, 500)
          : 'Tool execution failed',
      code:
        error && typeof error === 'object' && 'code' in error
          ? String(error.code)
          : undefined,
    };
    if (run)
      await input.database.db
        .update(agentToolRuns)
        .set({ status: 'failed', resultSummary: safe, updatedAt: new Date() })
        .where(eq(agentToolRuns.id, run.id));
    await input.database.db.insert(auditEvents).values({
      userId: input.userId,
      action: `tool.${input.name}`,
      resource: run?.id || correlationId,
      outcome: 'failed',
      metadata: { correlationId, code: safe.code },
    });
    throw error;
  }
}

import { eq } from 'drizzle-orm';
function summarizeResult(value: unknown): unknown {
  if (Array.isArray(value)) return { itemCount: value.length };
  if (!value || typeof value !== 'object')
    return { value: String(value).slice(0, 500) };
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record)
      .filter(([key]) =>
        /^(id|jobId|projectId|state|status|queued|sampleSize|requiresConfirmation|message|mode)$/i.test(
          key
        )
      )
      .slice(0, 20)
  );
}
