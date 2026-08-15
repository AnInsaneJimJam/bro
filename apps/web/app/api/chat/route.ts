import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, asc, desc, eq, gt } from 'drizzle-orm';
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
import {
  chatMessages,
  chatThreads,
  createDatabase,
  nicheVersions,
  scripts,
  topicOpportunities,
  trendRuns,
} from '@bro/db';
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
      const conversationHistory = await database.db
        .select({ role: chatMessages.role, content: chatMessages.content })
        .from(chatMessages)
        .where(eq(chatMessages.threadId, ownedThreadId))
        .orderBy(asc(chatMessages.createdAt))
        .limit(20);
      await database.db
        .insert(chatMessages)
        .values({ threadId: ownedThreadId, role: 'user', content: message });
      const workspace = await loadChatWorkspace(database.db, user.id),
        directNicheReply = confirmedNicheReply(message, workspace);
      if (directNicheReply) {
        await database.db.insert(chatMessages).values({
          threadId: ownedThreadId,
          role: 'assistant',
          content: directNicheReply,
        });
        return NextResponse.json({
          type: 'assistant',
          message: directNicheReply,
          mode: 'live',
          confirmations: [],
          threadId: ownedThreadId,
        });
      }
      const modelMessage = `Workspace context (treat confirmedNiche as authoritative; do not infer a replacement unless the creator explicitly asks to re-infer):\n${JSON.stringify(workspace)}\n\nConversation history (oldest first; preserve the topic from earlier turns when answering a follow-up):\n${JSON.stringify([...conversationHistory, { role: 'user', content: message }])}\n\nCurrent creator request:\n${message}`;
      const execute: ToolExecutor = async (name, args, context) => {
        const normalizedArgs = normalizeChatToolArguments(name, args, workspace),
          validated = validateToolCall(name, normalizedArgs) as Record<
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
              message: modelMessage,
              executor: execute,
            })
          : ai.provider === 'openrouter'
            ? await runOpenRouterToolLoop({
                apiKey: ai.apiKey,
                model: ai.model,
                message: modelMessage,
                executor: execute,
                siteUrl: ai.siteUrl,
                appName: ai.appName,
                timeoutMs: ai.timeoutMs,
              })
            : await runResponsesToolLoop({
                apiKey: ai.apiKey,
                model: ai.model,
                message: modelMessage,
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
      const action = chatActionSummary(result),
        assistantMessage = action?.message || result.text || '';
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
        ...(action?.action ? { action: action.action } : {}),
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
    const demoAction =
      resolution.tool === 'generate_short_script' &&
      result &&
      typeof result === 'object' &&
      typeof (result as { id?: unknown }).id === 'string'
        ? {
            type: 'open_scripts' as const,
            scriptId: (result as { id: string }).id,
          }
        : undefined;
    return NextResponse.json({
      type: 'tool_result',
      tool: resolution.tool,
      result,
      mode: 'demo',
      message: summarize(resolution.tool, result),
      ...(demoAction ? { action: demoAction } : {}),
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
type ChatWorkspace = {
  confirmedNiche: {
    id: string;
    label: string | null;
    subNiches: unknown;
  } | null;
  proposedNiche: {
    id: string;
    label: string | null;
    subNiches: unknown;
  } | null;
  topicOpportunities: Array<{
    id: string;
    idPrefix: string;
    topic: string | null;
    angle: string | null;
    score: number | null;
  }>;
  recentScripts: Array<{
    id: string;
    title: string | null;
    duration: number | null;
  }>;
};
async function loadChatWorkspace(
  database: ReturnType<typeof createDatabase>['db'],
  userId: string
): Promise<ChatWorkspace> {
  const [confirmedNiches, proposedNiches, opportunities, recentScripts] =
    await Promise.all([
      database
        .select({
          id: nicheVersions.id,
          label: nicheVersions.label,
          subNiches: nicheVersions.subNiches,
        })
        .from(nicheVersions)
        .where(
          and(
            eq(nicheVersions.userId, userId),
            eq(nicheVersions.status, 'confirmed')
          )
        )
        .orderBy(desc(nicheVersions.updatedAt))
        .limit(1),
      database
        .select({
          id: nicheVersions.id,
          label: nicheVersions.label,
          subNiches: nicheVersions.subNiches,
        })
        .from(nicheVersions)
        .where(
          and(
            eq(nicheVersions.userId, userId),
            eq(nicheVersions.status, 'proposed')
          )
        )
        .orderBy(desc(nicheVersions.updatedAt))
        .limit(1),
      database
        .select({
          id: topicOpportunities.id,
          topic: topicOpportunities.topic,
          angle: topicOpportunities.angle,
          score: topicOpportunities.score,
        })
        .from(topicOpportunities)
        .innerJoin(trendRuns, eq(topicOpportunities.runId, trendRuns.id))
        .where(
          and(
            eq(trendRuns.userId, userId),
            eq(trendRuns.status, 'ready'),
            gt(trendRuns.expiresAt, new Date())
          )
        )
        .orderBy(desc(topicOpportunities.score))
        .limit(10),
      database
        .select({
          id: scripts.id,
          title: scripts.title,
          duration: scripts.duration,
        })
        .from(scripts)
        .where(eq(scripts.userId, userId))
        .orderBy(desc(scripts.updatedAt))
        .limit(10),
    ]);
  const toNiche = (
    value:
      | {
          id: string;
          label: string | null;
          subNiches: unknown;
        }
      | undefined
  ) =>
    value
      ? { id: value.id, label: value.label, subNiches: value.subNiches }
      : null;
  const confirmedNiche = toNiche(confirmedNiches[0]);
  return {
    confirmedNiche,
    // Once a confirmed niche exists, stale proposals are not useful context
    // and can make the model appear to “change” the creator's niche.
    proposedNiche: confirmedNiche ? null : toNiche(proposedNiches[0]),
    topicOpportunities: opportunities.map((opportunity) => ({
      ...opportunity,
      // The full UUID remains available to the model, while this stable
      // prefix gives the creator a short value to copy from a chat table.
      idPrefix: opportunity.id.slice(0, 8),
    })),
    recentScripts,
  };
}

function normalizeChatToolArguments(
  name: string,
  args: Record<string, unknown>,
  workspace: ChatWorkspace
) {
  if (name !== 'generate_short_script' || typeof args.topicId !== 'string')
    return args;
  const raw = args.topicId.trim();
  // The model may repeat the short ID shown in its previous answer, including
  // a Unicode ellipsis ("fa6eb615…") or three dots. Resolve that prefix only
  // when it maps to exactly one opportunity owned by this user.
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(raw)) return args;
  if (/\s/.test(raw) || /[^0-9a-f.\u2026]/i.test(raw))
    return {
      ...args,
      topicId: undefined,
      topic: typeof args.topic === 'string' ? args.topic : raw,
    };
  const prefix = raw
    .toLowerCase()
    .replace(/[.\u2026\s]/g, '')
    .replace(/[^0-9a-f]/g, '');
  // If the model put the creator's natural-language topic in topicId despite
  // the tool description, recover it as the explicit custom topic instead of
  // treating it as a broken UUID.
  if (!/^[0-9a-f]{6,32}$/.test(prefix))
    return {
      ...args,
      topicId: undefined,
      topic: typeof args.topic === 'string' ? args.topic : raw,
    };
  const matches = workspace.topicOpportunities.filter((item) =>
    item.id.toLowerCase().startsWith(prefix)
  );
  if (matches.length === 1)
    return { ...args, topicId: matches[0]!.id };
  if (!matches.length)
    throw Object.assign(
      new Error(
        `I could not match topic ID “${raw}”. Choose one of the topic IDs shown in Bro Chat or open Ideas and select a topic.`
      ),
      { status: 400, code: 'TOPIC_NOT_FOUND' }
    );
  throw Object.assign(
    new Error(
      'That topic ID is ambiguous. Please copy a longer ID prefix or choose the topic from Ideas.'
    ),
    { status: 400, code: 'TOPIC_ID_AMBIGUOUS' }
  );
}
function confirmedNicheReply(
  message: string,
  workspace: ChatWorkspace
): string | undefined {
  const normalized = message
    .trim()
    .toLowerCase()
    .replace(/[?!.,]/g, '')
    .replace(/\s+/g, ' ');
  if (
    !/^(what(?:'s|s| is) my niche|what is my confirmed niche|show my niche|my niche)$/.test(
      normalized
    )
  )
    return undefined;
  if (workspace.confirmedNiche?.label) {
    const subNiches = Array.isArray(workspace.confirmedNiche.subNiches)
      ? workspace.confirmedNiche.subNiches.filter(
          (value): value is string => typeof value === 'string'
        )
      : [];
    return `Your confirmed niche is ${workspace.confirmedNiche.label}.${subNiches.length ? ` Sub-niches: ${subNiches.join(', ')}.` : ''} Bro will use this niche for topic opportunities.`;
  }
  if (workspace.proposedNiche?.label)
    return `Your current proposed niche is ${workspace.proposedNiche.label}, but it is not confirmed yet. Confirm or edit it before discovering topics.`;
  return 'You do not have a confirmed niche yet. Open the niche review step and confirm one before discovering topics.';
}
function chatActionSummary(result: {
  toolResults: Array<{ name: string; result: unknown }>;
}):
  | {
      message: string;
      action?: { type: 'open_scripts'; scriptId: string };
    }
  | undefined {
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
      return {
        message: `Script generated${title}. Opening Scripts so you can review and edit it.`,
        action: { type: 'open_scripts', scriptId: record.id },
      };
    }
    if (
      item.name === 'infer_creator_niche' &&
      typeof record.label === 'string'
    ) {
      const subNiches = Array.isArray(record.subNiches)
        ? record.subNiches.filter(
            (value): value is string => typeof value === 'string'
          )
        : [];
      return {
        message: `I found a proposed niche: ${record.label}${subNiches.length ? ` (${subNiches.join(', ')})` : ''}. Open Ideas or the niche review step to confirm or edit it before discovering topics.`,
      };
    }
    if (
      item.name === 'confirm_creator_niche' &&
      typeof record.label === 'string'
    )
      return {
        message: `Niche confirmed as ${record.label}. Bro will use it for topic opportunities.`,
      };
    if (
      item.name === 'discover_topic_opportunities' &&
      Array.isArray(record.items)
    )
      return {
        message: 'Topic opportunities are ready. Open Ideas to review them.',
      };
    if (item.name === 'sync_creator_content' && record.queued === true)
      return {
        message:
          'Content sync queued. I will use the refreshed records for the next Bro action.',
      };
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
