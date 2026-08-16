import OpenAI from 'openai';
import { zodResponsesFunction } from 'openai/helpers/zod';
import {
  isDeferredVideoEditingTool,
  toolSchemas,
  type ToolName,
  validateToolCall,
} from './index';
import { zodToGeminiSchema } from './gemini-schema';
import { createOpenRouterClient, isOpenRouterTimeout } from './openrouter';

export type ToolExecutor = (
  name: ToolName,
  args: Record<string, unknown>,
  context: { callId: string }
) => Promise<unknown>;
const descriptions: Record<ToolName, string> = {
  get_creator_profile:
    'Get the authenticated creator profile, country, and confirmed niche.',
  get_connection_status: 'Check connected account health.',
  sync_creator_content: 'Queue owned-content synchronization.',
  infer_creator_niche:
    'Infer or re-infer a niche from bounded stored owned content only when the creator explicitly asks. Do not use this for a confirmed-niche question.',
  confirm_creator_niche: 'Confirm or edit a proposed niche.',
  discover_topic_opportunities:
    'Discover evidence-backed opportunities for the confirmed niche and country.',
  generate_short_script:
    'Create a versioned vertical short-form script from a workspace opportunity or an explicitly creator-supplied topic. Custom topics are not trend evidence.',
  list_scripts: "List the creator's scripts.",
  create_video_project: 'Create a project for an uploaded owned video.',
  list_video_projects: 'List owned video projects.',
  transcribe_video_for_captions:
    'Queue timestamped English caption transcription.',
  render_captioned_video: 'Queue caption burn-in rendering.',
  publish_video_now:
    'Publish a ready owned video after application confirmation rules.',
  schedule_video_publish:
    'Schedule a ready owned video in the supplied IANA time zone.',
  reschedule_publish_job: 'Move an existing owned scheduled job.',
  cancel_publish_job: 'Cancel an owned cancellable job.',
  list_publish_jobs: 'List owned publishing jobs.',
  sync_comments: 'Sync comments on owned YouTube or Instagram media.',
  analyze_comments:
    'Analyze only stored comments matching the supplied filters.',
};
export function createResponseTools() {
  return Object.entries(toolSchemas)
    .filter(([name]) => !isDeferredVideoEditingTool(name))
    .map(([name, schema]) =>
      zodResponsesFunction({
        name,
        description: descriptions[name as ToolName],
        parameters: schema,
      })
    );
}

export function createGeminiFunctionDeclarations() {
  return Object.entries(toolSchemas)
    .filter(([name]) => !isDeferredVideoEditingTool(name))
    .map(([name, schema]) => ({
      name,
      description: descriptions[name as ToolName],
      parameters: zodToGeminiSchema(schema),
    }));
}

export function createOpenRouterTools() {
  return Object.entries(toolSchemas)
    .filter(([name]) => !isDeferredVideoEditingTool(name))
    .map(([name, schema]) => ({
      type: 'function' as const,
      function: {
        name,
        description: descriptions[name as ToolName],
        parameters: zodToGeminiSchema(schema),
      },
    }));
}

export async function runResponsesToolLoop(input: {
  apiKey: string;
  model: string;
  message: string;
  executor: ToolExecutor;
  previousResponseId?: string;
  maxRounds?: number;
}) {
  const client = new OpenAI({ apiKey: input.apiKey });
  const tools = createResponseTools(),
    toolResults: Array<{ name: ToolName; result: unknown }> = [];
  let response = await client.responses.create({
    model: input.model,
    input: input.message,
    previous_response_id: input.previousResponseId,
    tools,
    instructions: SYSTEM,
  });
  for (let round = 0; round < (input.maxRounds ?? 6); round++) {
    const calls = response.output.filter(
      (item) => item.type === 'function_call'
    );
    if (!calls.length)
      return {
        responseId: response.id,
        text: response.output_text,
        toolCalls: round,
        toolResults,
      };
    const outputs = [];
    for (const call of calls) {
      const args = validateToolCall(
        call.name,
        JSON.parse(call.arguments)
      ) as Record<string, unknown>;
      const result = await input.executor(call.name as ToolName, args, {
        callId: call.call_id,
      });
      toolResults.push({ name: call.name as ToolName, result });
      outputs.push({
        type: 'function_call_output' as const,
        call_id: call.call_id,
        output: JSON.stringify(result),
      });
    }
    response = await client.responses.create({
      model: input.model,
      previous_response_id: response.id,
      input: outputs,
      tools,
      instructions: SYSTEM,
    });
  }
  throw new Error('Bro exceeded the maximum tool-call rounds');
}

export async function runOpenRouterToolLoop(input: {
  apiKey: string;
  model: string;
  message: string;
  executor: ToolExecutor;
  maxRounds?: number;
  siteUrl?: string;
  appName?: string;
  timeoutMs?: number;
}) {
  const client = createOpenRouterClient({
      apiKey: input.apiKey,
      siteUrl: input.siteUrl,
      appName: input.appName,
      timeoutMs: input.timeoutMs,
    }),
    messages: OpenRouterLoopMessage[] = [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: input.message },
    ],
    toolResults: Array<{ name: ToolName; result: unknown }> = [];
  for (let round = 0; round < (input.maxRounds ?? 6); round++) {
    // OpenRouter extends the OpenAI Chat Completions request with a reasoning
    // flag. Keep it in the request while preserving the SDK's compatibility.
    let response;
    try {
      response = await client.chat.completions.create({
        model: input.model,
        messages: messages as never,
        tools: createOpenRouterTools(),
        tool_choice: 'auto',
        reasoning: { enabled: true },
      } as never);
    } catch (error) {
      if (isOpenRouterTimeout(error))
        throw Object.assign(
          new Error(
            'The AI provider took too long to respond. Try again or choose a faster OpenRouter model.'
          ),
          { status: 504, code: 'AI_PROVIDER_TIMEOUT', cause: error }
        );
      throw error;
    }
    const choice = Array.isArray(response?.choices)
      ? response.choices[0]
      : undefined;
    const message =
      choice && typeof choice === 'object' && 'message' in choice
        ? (choice.message as OpenRouterMessage)
        : undefined;
    if (!message)
      throw Object.assign(
        new Error('OpenRouter returned an invalid assistant response'),
        {
          status: 502,
          code: 'AI_INVALID_RESPONSE',
        }
      );
    const calls = message.tool_calls || [];
    messages.push({
      role: 'assistant',
      content: message.content,
      ...(calls.length ? { tool_calls: calls } : {}),
      ...(message.reasoning_details !== undefined
        ? { reasoning_details: message.reasoning_details }
        : {}),
    });
    if (!calls.length)
      return {
        responseId: response.id,
        text: message.content || '',
        toolCalls: round,
        toolResults,
      };
    for (const call of calls) {
      let rawArgs: unknown;
      try {
        rawArgs = JSON.parse(call.function.arguments || '{}');
      } catch (error) {
        throw Object.assign(
          new Error('OpenRouter returned invalid tool arguments'),
          {
            status: 502,
            cause: error,
          }
        );
      }
      const args = validateToolCall(call.function.name, rawArgs) as Record<
          string,
          unknown
        >,
        result = await input.executor(call.function.name as ToolName, args, {
          callId: call.id,
        });
      toolResults.push({ name: call.function.name as ToolName, result });
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
    // These tools already return the user-facing artifact. Avoid an extra
    // model round just to paraphrase it; this also makes action commands
    // reliable when a free model returns an incomplete follow-up response.
    if (
      calls.some((call) =>
        [
          'infer_creator_niche',
          'confirm_creator_niche',
          'discover_topic_opportunities',
          'generate_short_script',
        ].includes(call.function.name)
      )
    )
      return {
        responseId: response.id,
        text: '',
        toolCalls: round + 1,
        toolResults,
      };
  }
  throw new Error('Bro exceeded the maximum OpenRouter tool-call rounds');
}

export async function runGeminiToolLoop(input: {
  apiKey: string;
  model: string;
  message: string;
  executor: ToolExecutor;
  maxRounds?: number;
  http?: typeof fetch;
}) {
  const http = input.http || fetch,
    contents: GeminiContent[] = [
      { role: 'user', parts: [{ text: input.message }] },
    ],
    toolResults: Array<{ name: ToolName; result: unknown }> = [];
  for (let round = 0; round < (input.maxRounds ?? 6); round++) {
    const response = await http(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': input.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents,
          tools: [{ functionDeclarations: createGeminiFunctionDeclarations() }],
          toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
        }),
      }
    );
    const payload = (await response.json()) as GeminiToolResponse;
    if (!response.ok)
      throw Object.assign(
        new Error(
          payload.error?.message || `Gemini request failed (${response.status})`
        ),
        { status: response.status === 429 ? 429 : 502 }
      );
    const modelContent = payload.candidates?.[0]?.content,
      parts = modelContent?.parts || [],
      calls = parts.flatMap((part) =>
        part.functionCall ? [part.functionCall] : []
      );
    if (!calls.length)
      return {
        responseId: `gemini-${Date.now()}`,
        text: parts
          .map((part) => part.text || '')
          .join('')
          .trim(),
        toolCalls: round,
        toolResults,
      };
    if (modelContent) contents.push(modelContent);
    const responses: GeminiPart[] = [];
    for (const call of calls) {
      const name = call.name as ToolName,
        args = validateToolCall(name, call.args || {}) as Record<
          string,
          unknown
        >,
        callId = call.id || crypto.randomUUID(),
        result = await input.executor(name, args, { callId });
      toolResults.push({ name, result });
      responses.push({
        functionResponse: {
          name,
          response: { result },
          ...(call.id ? { id: call.id } : {}),
        },
      });
    }
    contents.push({ role: 'user', parts: responses });
  }
  throw new Error('Bro exceeded the maximum Gemini tool-call rounds');
}
const SYSTEM = `You are Bro, a concise English creator workflow assistant. Use only the supplied application tools for data and actions. Treat a workspace confirmedNiche as authoritative; never replace it with a new inference unless the creator explicitly asks to re-infer. For “what is my niche?” answer from confirmedNiche or proposedNiche context and do not call infer_creator_niche. Never claim current trends without tool evidence. For script requests, use a workspace opportunity when one matches. The context includes each opportunity's full UUID and an idPrefix; the creator may reply with the short prefix or topic title and you should select the matching opportunity. If the creator explicitly names a topic that is not listed, pass it as the tool's topic field and generate an evergreen script without calling it a trend or inventing evidence. Ask for any missing duration or platforms instead of guessing them, and preserve the topic from conversation history when the creator supplies those details in a follow-up. The workspace context includes today (the creator's current local date, already resolved from their profile time zone) and timeZone (their IANA time zone). Resolve relative dates like "today" or "tomorrow" yourself from these instead of asking the creator to restate an exact date — only ask if they name a date you genuinely cannot resolve, or if their profile has no time zone set. Default to the creator's own time zone for scheduling unless they name a different one. The workspace context also includes recentVideoProjects with each project's id, filename, state, and any already-drafted YouTube title/description and Instagram caption; when the creator describes a video by name (e.g. "my sketching video") or asks to publish/schedule "it", match it against recentVideoProjects instead of asking for its ID, and if a draftedTitle/draftedDescription/draftedInstagramCaption already exists, use it as that destination's metadata by default rather than asking the creator to type a title — only ask if no draft exists for the destination they chose, or if they explicitly ask to change it. Still never guess a video the creator hasn't identified, or a date/time/time zone you can't resolve from context; ask one precise follow-up only for what's genuinely missing. Externally visible actions remain governed by application confirmation and auto-publish policy. English captions are auto-generated from a video's transcript once it validates; use render_captioned_video to burn them into the video the creator uploaded, and note that publishing will then use that captioned version instead of the original. Caption text can only be edited in the Upload page's captions editor, not through chat. Never request, reveal, or accept OAuth tokens or passwords.`;

type GeminiPart = {
  text?: string;
  thoughtSignature?: string;
  functionCall?: {
    name: string;
    args?: Record<string, unknown>;
    id?: string;
  };
  functionResponse?: {
    name: string;
    response: { result: unknown };
    id?: string;
  };
};
type OpenRouterToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};
type OpenRouterMessage = {
  role: 'assistant';
  content: string | null;
  tool_calls?: OpenRouterToolCall[];
  reasoning_details?: unknown;
};
type OpenRouterLoopMessage =
  | { role: 'system' | 'user'; content: string }
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: OpenRouterToolCall[];
      reasoning_details?: unknown;
    }
  | { role: 'tool'; tool_call_id: string; content: string };
type GeminiContent = { role: string; parts: GeminiPart[] };
type GeminiToolResponse = {
  candidates?: Array<{ content?: GeminiContent }>;
  error?: { message?: string };
};
