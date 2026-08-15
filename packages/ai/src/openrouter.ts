import OpenAI from 'openai';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export type OpenRouterOptions = {
  apiKey: string;
  siteUrl?: string;
  appName?: string;
  /** Maximum time a single provider request may occupy a web request. */
  timeoutMs?: number;
};

export function createOpenRouterClient(options: OpenRouterOptions) {
  return new OpenAI({
    apiKey: options.apiKey,
    baseURL: OPENROUTER_BASE_URL,
    // The SDK retries transient failures by default. That is useful for a
    // background worker, but it can multiply latency for a user-facing
    // request. The application has its own retry/fallback policy instead.
    maxRetries: 0,
    timeout: options.timeoutMs ?? 45_000,
    defaultHeaders: {
      ...(options.siteUrl ? { 'HTTP-Referer': options.siteUrl } : {}),
      ...(options.appName ? { 'X-Title': options.appName } : {}),
    },
  });
}

export function isOpenRouterTimeout(error: unknown) {
  const value = error as { name?: string; code?: string; message?: string };
  return (
    value?.name === 'APIConnectionTimeoutError' ||
    value?.code === 'ETIMEDOUT' ||
    /timed? ?out|timeout|aborted/i.test(value?.message || '')
  );
}

export type OpenRouterReasoningMessage = {
  role: 'assistant';
  content: string | null;
  tool_calls?: unknown;
  reasoning_details?: unknown;
};

export function parseJsonText(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as unknown;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start)
      throw new Error('OpenRouter returned no JSON object');
    return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
  }
}
