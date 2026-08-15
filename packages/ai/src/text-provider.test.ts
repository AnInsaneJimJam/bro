import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { generateStructuredText } from './text-provider';

describe('Gemini structured text provider', () => {
  it('uses structured JSON mode and validates the returned payload', async () => {
    const http = vi.fn(async (_url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)['x-goog-api-key']).toBe(
        'test-key'
      );
      const body = JSON.parse(String(init?.body));
      expect(body.generationConfig.responseMimeType).toBe('application/json');
      expect(body.generationConfig.responseSchema).toBeTruthy();
      expect(body.generationConfig.responseSchema.$ref).toBeUndefined();
      expect(body.generationConfig.responseSchema.definitions).toBeUndefined();
      return new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: '{"answer":"ready"}' }] } },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as unknown as typeof fetch;
    const result = await generateStructuredText(
      { provider: 'gemini', apiKey: 'test-key', model: 'gemini-flash-latest' },
      {
        schema: z.object({ answer: z.string() }),
        schemaName: 'answer',
        system: 'Return an answer.',
        user: 'Ready?',
      },
      http
    );
    expect(result).toEqual({ answer: 'ready' });
  });
});
