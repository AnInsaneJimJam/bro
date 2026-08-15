import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { resolveDemoCommand, validateToolCall } from '@bro/ai';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { executeDemoTool } from '@/lib/demo-tools';
import { jsonError } from '@/lib/http';
import {
  runGeminiToolLoop,
  runOpenRouterToolLoop,
  runResponsesToolLoop,
  type ToolExecutor,
} from '@bro/ai/responses-loop';
import { executeToolThroughOwnedRoutes } from '@/lib/tool-api';
import { chatMessages, chatThreads, createDatabase } from '@bro/db';
import { executeAuditedTool } from '@/lib/tool-audit';
import { textProviderConfig } from '@/lib/text-ai';
const input = z.object({
  message: z.string().min(1).max(4000),
  threadId: z.string().uuid().optional(),
});
export async function POST(req: Request) {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    enforceRateLimit(`chat:${user.id}`, 20, 60_000);
    const { message, threadId } = input.parse(await req.json());
    if (!user.demo) {
      const ai = textProviderConfig();
      const database = createDatabase();
      close = database.close;
      let ownedThreadId = threadId;
      if (ownedThreadId) {
        const [owned] = await database.db
          .select({ id: chatThreads.id })
          .from(chatThreads)
          .where(
            and(
              eq(chatThreads.id, ownedThreadId),
              eq(chatThreads.userId, user.id)
            )
          )
          .limit(1);
        if (!owned)
          throw Object.assign(new Error('Chat thread not found'), {
            status: 404,
          });
      } else {
        const [created] = await database.db
          .insert(chatThreads)
          .values({ userId: user.id, title: message.slice(0, 80) })
          .returning({ id: chatThreads.id });
        ownedThreadId = created!.id;
      }
      await database.db
        .insert(chatMessages)
        .values({ threadId: ownedThreadId, role: 'user', content: message });
      const execute: ToolExecutor = async (name, args, context) => {
        const validated = validateToolCall(name, args) as Record<
          string,
          unknown
        >;
        return executeAuditedTool({
          database,
          userId: user.id,
          name,
          args: validated,
          callId: context.callId,
          execute: () => executeToolThroughOwnedRoutes(req, name, validated),
        });
      };
      const result =
        ai.provider === 'gemini'
          ? await runGeminiToolLoop({
              apiKey: ai.apiKey,
              model: ai.model,
              message,
              executor: execute,
            })
          : ai.provider === 'openrouter'
            ? await runOpenRouterToolLoop({
                apiKey: ai.apiKey,
                model: ai.model,
                message,
                executor: execute,
                siteUrl: ai.siteUrl,
                appName: ai.appName,
                timeoutMs: ai.timeoutMs,
              })
            : await runResponsesToolLoop({
                apiKey: ai.apiKey,
                model: ai.model,
                message,
                executor: execute,
              });
      const confirmations = result.toolResults
        .map((item) => item.result)
        .filter(
          (
            value
          ): value is {
            requiresConfirmation: true;
            jobId: string;
            card: unknown;
          } =>
            !!value &&
            typeof value === 'object' &&
            (value as { requiresConfirmation?: boolean })
              .requiresConfirmation === true
        );
      const assistantMessage = chatActionSummary(result) || result.text || '';
      await database.db.insert(chatMessages).values({
        threadId: ownedThreadId,
        role: 'assistant',
        content: assistantMessage,
        toolSummary: result.toolResults.map((item) => ({
          name: item.name,
          result: summarizeAudit(item.result),
        })),
      });
      return NextResponse.json({
        type: 'assistant',
        message: assistantMessage,
        responseId: result.responseId,
        mode: 'live',
        confirmations,
        threadId: ownedThreadId,
      });
    }
    const resolution = resolveDemoCommand(message);
    if ('followUp' in resolution)
      return NextResponse.json({
        type: 'follow_up',
        message: resolution.followUp,
        mode: 'demo',
      });
    const args = validateToolCall(
      resolution.tool,
      resolution.arguments
    ) as Record<string, unknown>;
    const result = await executeDemoTool(resolution.tool, args);
    return NextResponse.json({
      type: 'tool_result',
      tool: resolution.tool,
      result,
      mode: 'demo',
      message: summarize(resolution.tool, result),
    });
  } catch (e) {
    return jsonError(e);
  } finally {
    await close?.();
  }
}
function summarizeAudit(value: unknown) {
  if (Array.isArray(value)) return { itemCount: value.length };
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, unknown>;
  return {
    id: record.id,
    jobId: record.jobId,
    projectId: record.projectId,
    state: record.state,
    status: record.status,
    requiresConfirmation: record.requiresConfirmation,
  };
}
function chatActionSummary(result: {
  toolResults: Array<{ name: string; result: unknown }>;
}) {
  for (const item of result.toolResults) {
    const value = item.result;
    if (!value || typeof value !== 'object') continue;
    const record = value as Record<string, unknown>;
    if (
      item.name === 'generate_short_script' &&
      typeof record.id === 'string'
    ) {
      const title =
        typeof record.title === 'string' ? ` “${record.title}”` : '';
      return `Script generated${title}. Open Scripts to review and edit it.`;
    }
    if (
      item.name === 'discover_topic_opportunities' &&
      Array.isArray(record.items)
    )
      return `Topic opportunities are ready. Open Ideas to review them.`;
    if (item.name === 'sync_creator_content' && record.queued === true)
      return 'Content sync queued. I will use the refreshed records for the next Bro action.';
  }
  return undefined;
}
function summarize(tool: string, result: unknown) {
  if (tool === 'infer_creator_niche')
    return `I found a proposed niche: ${(result as { label: string }).label}. Review the evidence and confirm or edit it before trend discovery.`;
  if (tool === 'discover_topic_opportunities')
    return `I found ${(result as unknown[]).length} current demo opportunities scoped to your confirmed niche and country.`;
  if (tool === 'generate_short_script')
    return `Drafted “${(result as { title: string }).title}”. It is saved as version 1.`;
  if (tool === 'analyze_comments')
    return (result as { summary: string }).summary;
  if (tool === 'transcribe_video_for_captions')
    return 'The labeled demo video has editable caption cues ready in Videos.';
  return `Completed ${tool}.`;
}
