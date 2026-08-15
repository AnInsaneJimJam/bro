import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { zodToGeminiSchema } from './gemini-schema';
import { createOpenRouterClient, parseJsonText } from './openrouter';

export type TextProviderConfig =
  | { provider: 'gemini'; apiKey: string; model: string }
  | { provider: 'openai'; apiKey: string; model: string }
  | {
      provider: 'openrouter';
      apiKey: string;
      model: string;
      siteUrl?: string;
      appName?: string;
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
    const response = await createOpenRouterClient(
      config
    ).chat.completions.create({
      model: config.model,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: `${input.system}\n\nReturn only one valid JSON object matching this schema. Do not include markdown fences or commentary.\n${JSON.stringify(jsonSchema)}`,
        },
        { role: 'user', content: input.user },
      ],
    });
    const text = response.choices[0]?.message?.content;
    if (!text)
      throw Object.assign(new Error('OpenRouter returned no structured text'), {
        status: 502,
      });
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
