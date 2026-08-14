import { describe, expect, it } from 'vitest';
import { GeminiCommandTranscriptionProvider } from './transcription';

describe('Gemini command transcription', () => {
  it('sends short audio as inline data and returns only the transcript', async () => {
    let request: RequestInit | undefined;
    const provider = new GeminiCommandTranscriptionProvider(
      'gemini-key',
      'gemini-flash-latest',
      async (_url, init) => {
        request = init;
        return new Response(
          JSON.stringify({
            candidates: [
              { content: { parts: [{ text: 'Publish this to YouTube now' }] } },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
    );
    const transcript = await provider.transcribeCommand(
      new File([new Uint8Array([1, 2, 3])], 'command.webm', {
        type: 'audio/webm;codecs=opus',
      })
    );
    expect(transcript).toBe('Publish this to YouTube now');
    const body = JSON.parse(String(request?.body));
    expect(body.contents[0].parts[1].inlineData).toMatchObject({
      mimeType: 'audio/webm',
      data: Buffer.from([1, 2, 3]).toString('base64'),
    });
    expect(request?.headers).toMatchObject({ 'x-goog-api-key': 'gemini-key' });
  });

  it('rejects inline audio larger than Gemini’s documented limit', async () => {
    const provider = new GeminiCommandTranscriptionProvider('gemini-key');
    const large = new File(
      [new Uint8Array(15 * 1024 * 1024 + 1)],
      'large.webm',
      {
        type: 'audio/webm',
      }
    );
    await expect(provider.transcribeCommand(large)).rejects.toMatchObject({
      status: 413,
    });
  });
});
