import OpenAI from 'openai';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export type OpenRouterOptions = {
  apiKey: string;
  siteUrl?: string;
  appName?: string;
};

export function createOpenRouterClient(options: OpenRouterOptions) {
  return new OpenAI({
    apiKey: options.apiKey,
    baseURL: OPENROUTER_BASE_URL,
    defaultHeaders: {
      ...(options.siteUrl ? { 'HTTP-Referer': options.siteUrl } : {}),
      ...(options.appName ? { 'X-Title': options.appName } : {}),
    },
  });
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
