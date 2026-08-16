import OpenAI from 'openai';
const maxGeminiInlineAudioBytes = 15 * 1024 * 1024;
export type TimedTranscript = {
  text: string;
  words: Array<{
    text: string;
    start: number;
    end: number;
    confidence?: number;
  }>;
};
export interface TranscriptionProvider {
  transcribeCommand(audio: File): Promise<string>;
  transcribeWithWordTimestamps(audio: File): Promise<TimedTranscript>;
}
export class OpenAITranscriptionProvider implements TranscriptionProvider {
  constructor(
    private client: OpenAI,
    private commandModel = 'gpt-transcribe',
    private captionModel = 'whisper-1'
  ) {}
  async transcribeCommand(audio: File) {
    const result = await this.client.audio.transcriptions.create({
      file: audio,
      model: this.commandModel,
      language: 'en',
    });
    return result.text;
  }
  async transcribeWithWordTimestamps(audio: File): Promise<TimedTranscript> {
    const result = await this.client.audio.transcriptions.create({
      file: audio,
      model: this.captionModel,
      language: 'en',
      response_format: 'verbose_json',
      timestamp_granularities: ['word'],
    });
    const value = result as unknown as {
      text: string;
      words?: Array<{ word: string; start: number; end: number }>;
    };
    if (!value.words?.length)
      throw new Error('Caption transcription did not return word timestamps');
    return {
      text: value.text,
      words: value.words.map((word) => ({
        text: word.word.trim(),
        start: word.start,
        end: word.end,
      })),
    };
  }
}

/**
 * Gemini's generateContent audio input is useful for short recorded commands
 * and uploaded short videos. It returns plain text; caption workflows still
 * require a provider that returns word timestamps.
 */
export class GeminiCommandTranscriptionProvider implements TranscriptionProvider {
  constructor(
    private apiKey: string,
    private model = 'gemini-flash-latest',
    private http: typeof fetch = fetch
  ) {}

  async transcribeCommand(audio: File) {
    const bytes = Buffer.from(await audio.arrayBuffer());
    // Base64 expands the bytes inside JSON, so keep the raw recording below
    // the API's 20 MB total inline-request ceiling.
    if (bytes.length > maxGeminiInlineAudioBytes)
      throw Object.assign(
        new Error(
          'Gemini command audio must be 15 MB or smaller. Record a shorter command.'
        ),
        { status: 413 }
      );
    const response = await this.http(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: 'Transcribe the English speech exactly. Return only the spoken words, with no quotation marks, explanation, or Markdown.',
              },
            ],
          },
          contents: [
            {
              role: 'user',
              parts: [
                { text: 'Transcribe this English audio recording.' },
                {
                  inlineData: {
                    mimeType: normalizeAudioMimeType(audio.type),
                    data: bytes.toString('base64'),
                  },
                },
              ],
            },
          ],
          generationConfig: { temperature: 0 },
        }),
      }
    );
    if (!response.ok)
      throw Object.assign(
        new Error(
          response.status === 429
            ? 'Gemini audio quota was reached. Try again later.'
            : `Gemini audio transcription failed (${response.status}).`
        ),
        {
          status: response.status >= 500 || response.status === 429 ? 503 : 502,
        }
      );
    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join(' ')
      .trim();
    if (!text) throw new Error('Gemini returned an empty audio transcript');
    return text;
  }

  async transcribeWithWordTimestamps(_audio: File): Promise<TimedTranscript> {
    throw new Error(
      'Gemini command transcription does not provide word timestamps; use the caption transcription provider.'
    );
  }
}

function normalizeAudioMimeType(value: string) {
  return value.toLowerCase().split(';', 1)[0]?.trim() || 'audio/webm';
}
