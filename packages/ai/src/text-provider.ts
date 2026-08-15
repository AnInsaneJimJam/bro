import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { zodToGeminiSchema } from './gemini-schema';
import {
  createOpenRouterClient,
  isOpenRouterTimeout,
  parseJsonText,
} from './openrouter';

export type TextProviderConfig =
  | { provider: 'gemini'; apiKey: string; model: string }
  | { provider: 'openai'; apiKey: string; model: string }
  | {
      provider: 'openrouter';
      apiKey: string;
      model: string;
      siteUrl?: string;
      appName?: string;
      timeoutMs?: number;
    };

export async function generateStructuredText<T>(
  config: TextProviderConfig,
  input: {
    schema: z.ZodType<T>;
    schemaName: string;
    system: string;
    user: string;
  },
  http: typeof fetch = fetch
): Promise<T> {
  if (config.provider === 'openai') {
    const response = await new OpenAI({
      apiKey: config.apiKey,
    }).responses.parse({
      model: config.model,
      input: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
      text: { format: zodTextFormat(input.schema, input.schemaName) },
    });
    if (!response.output_parsed)
      throw Object.assign(
        new Error('The text model returned no validated result'),
        {
          status: 502,
        }
      );
    return response.output_parsed;
  }

  if (config.provider === 'openrouter') {
    const jsonSchema = zodToJsonSchema(input.schema, {
      target: 'jsonSchema7',
      $refStrategy: 'none',
    });
    let response;
    try {
      response = await createOpenRouterClient(config).chat.completions.create({
        model: config.model,
        temperature: 0.2,
        // Topic cards and scripts do not need a long reasoning trace. Keeping
        // reasoning off is materially faster on Nemotron and still leaves the
        // schema validation below as the correctness boundary.
        reasoning: { enabled: false },
        max_tokens: 2_400,
        messages: [
          {
            role: 'system',
            content: `${input.system}\n\nReturn only one valid JSON object matching this schema. Do not include markdown fences or commentary.\n${JSON.stringify(jsonSchema)}`,
          },
          { role: 'user', content: input.user },
        ],
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
    // A free OpenRouter model can occasionally return a successful HTTP
    // response without the normal Chat Completions `choices` array (for
    // example, while a provider is being unloaded). Do not dereference that
    // shape blindly: script generation has a transparent deterministic
    // fallback for typed provider failures.
    const text = response?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim())
      throw Object.assign(
        new Error('OpenRouter returned no structured text'),
        {
          status: 502,
          code: 'AI_INVALID_RESPONSE',
        }
      );
    try {
      return input.schema.parse(parseJsonText(text));
    } catch (error) {
      throw Object.assign(
        new Error('OpenRouter returned invalid structured output'),
        { status: 502, cause: error }
      );
    }
  }

  const response = await http(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': config.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.system }] },
        contents: [{ role: 'user', parts: [{ text: input.user }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: zodToGeminiSchema(input.schema),
        },
      }),
    }
  );
  const payload = (await response.json()) as GeminiResponse;
  if (!response.ok)
    throw Object.assign(
      new Error(
        payload.error?.message || `Gemini request failed (${response.status})`
      ),
      { status: response.status === 429 ? 429 : 502 }
    );
  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('')
    .trim();
  if (!text)
    throw Object.assign(new Error('Gemini returned no structured text'), {
      status: 502,
    });
  try {
    return input.schema.parse(JSON.parse(text));
  } catch (error) {
    throw Object.assign(
      new Error('Gemini returned invalid structured output'),
      {
        status: 502,
        cause: error,
      }
    );
  }
}

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  error?: { message?: string };
};
