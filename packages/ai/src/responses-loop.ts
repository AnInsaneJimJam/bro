import OpenAI from 'openai';
import { zodResponsesFunction } from 'openai/helpers/zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  isDeferredVideoEditingTool,
  toolSchemas,
  type ToolName,
  validateToolCall,
} from './index';

export type ToolExecutor = (
  name: ToolName,
  args: Record<string, unknown>,
  context: { callId: string }
) => Promise<unknown>;
const descriptions: Record<ToolName, string> = {
  get_creator_profile: 'Get the authenticated creator profile.',
  get_connection_status: 'Check connected account health.',
  sync_creator_content: 'Queue owned-content synchronization.',
  infer_creator_niche: 'Infer a niche from bounded stored owned content.',
  confirm_creator_niche: 'Confirm or edit a proposed niche.',
  discover_topic_opportunities:
    'Discover evidence-backed opportunities for the confirmed niche and country.',
  generate_short_script: 'Create a versioned vertical short-form script.',
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
      parameters: zodToJsonSchema(schema, {
        target: 'openApi3',
        $refStrategy: 'none',
      }),
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
const SYSTEM = `You are Bro, a concise English creator workflow assistant. Use only the supplied application tools for data and actions. Never claim current trends without tool evidence. Never guess required video, platform, duration, date, time, or time zone; ask one precise follow-up. Externally visible actions remain governed by application confirmation and auto-publish policy. Subtitle transcription and caption burn-in are not enabled in this MVP; if asked, explain that the creator can upload and publish the original video now and that subtitle editing is planned for a later slice. Never request, reveal, or accept OAuth tokens or passwords.`;

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
type GeminiContent = { role: string; parts: GeminiPart[] };
type GeminiToolResponse = {
  candidates?: Array<{ content?: GeminiContent }>;
  error?: { message?: string };
};
