import OpenAI from 'openai';
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
