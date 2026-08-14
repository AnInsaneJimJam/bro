import { describe, expect, it, vi } from 'vitest';
import { runGeminiToolLoop } from './responses-loop';

describe('Gemini tool loop', () => {
  it('executes a validated tool and returns the final answer', async () => {
    const http = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  role: 'model',
                  parts: [
                    {
                      functionCall: {
                        id: 'call-1',
                        name: 'get_creator_profile',
                        args: {},
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  role: 'model',
                  parts: [{ text: 'Your profile is ready.' }],
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      ) as unknown as typeof fetch;
    const executor = vi.fn(async () => ({ displayName: 'Creator' }));
    const result = await runGeminiToolLoop({
      apiKey: 'test-key',
      model: 'gemini-flash-latest',
      message: 'Show my profile',
      executor,
      http,
    });
    expect(executor).toHaveBeenCalledWith(
      'get_creator_profile',
      {},
      { callId: 'call-1' }
    );
    expect(result.text).toBe('Your profile is ready.');
    expect(result.toolResults).toHaveLength(1);
  });
});
