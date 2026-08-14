import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { z } from 'zod';

export type TextProviderConfig =
  | { provider: 'gemini'; apiKey: string; model: string }
  | { provider: 'openai'; apiKey: string; model: string };

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
          responseSchema: zodToJsonSchema(input.schema, {
            name: input.schemaName,
            target: 'openApi3',
            $refStrategy: 'none',
          }),
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
