import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import {
  GeminiCommandTranscriptionProvider,
  OpenAITranscriptionProvider,
  createGroqTranscriptionClient,
} from '@bro/ai';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { jsonError } from '@/lib/http';
import { validateCommandAudio } from '@/lib/audio';
const geminiAudioTypes = new Set([
  'audio/wav',
  'audio/mp3',
  'audio/mpeg',
  'audio/aiff',
  'audio/aac',
  'audio/ogg',
  'audio/flac',
]);
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    enforceRateLimit(`audio:${user.id}`, 10, 60_000);
    const form = await req.formData(),
      file = form.get('audio');
    if (!(file instanceof File)) throw new Error('Audio file is required');
    validateCommandAudio(file);
    const geminiKey = process.env.GEMINI_API_KEY,
      openAiKey = process.env.OPENAI_API_KEY,
      groqKey = process.env.GROQ_API_KEY,
      mimeType = file.type.toLowerCase().split(';', 1)[0]?.trim();
    let text: string, provider: 'gemini' | 'openai' | 'groq';
    // Groq is tried first: it's free, has no observed reliability issues, and
    // already backs video transcription. Gemini is a last-resort fallback
    // only, since its audio endpoint has been unreliable (intermittent 503s).
    if (groqKey) {
      const transcriber = new OpenAITranscriptionProvider(
        createGroqTranscriptionClient(groqKey),
        process.env.GROQ_COMMAND_TRANSCRIPTION_MODEL || 'whisper-large-v3-turbo'
      );
      text = await transcriber.transcribeCommand(file);
      provider = 'groq';
    } else if (openAiKey) {
      const transcriber = new OpenAITranscriptionProvider(
        new OpenAI({ apiKey: openAiKey }),
        process.env.OPENAI_COMMAND_TRANSCRIPTION_MODEL || 'gpt-transcribe'
      );
      text = await transcriber.transcribeCommand(file);
      provider = 'openai';
    } else if (geminiKey && geminiAudioTypes.has(mimeType || '')) {
      const transcriber = new GeminiCommandTranscriptionProvider(
        geminiKey,
        process.env.GEMINI_COMMAND_TRANSCRIPTION_MODEL ||
          process.env.GEMINI_TEXT_MODEL ||
          'gemini-flash-latest'
      );
      text = await transcriber.transcribeCommand(file);
      provider = 'gemini';
    } else if (geminiKey)
      throw Object.assign(
        new Error(
          'Gemini accepts WAV, MP3, AAC, OGG, AIFF, or FLAC command audio. Allow Bro to convert the browser recording to WAV, or add GROQ_API_KEY/OPENAI_API_KEY as a fallback.'
        ),
        { status: 415 }
      );
    else
      throw Object.assign(
        new Error(
          'Audio transcription is not configured. Add GROQ_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY to use recorded commands.'
        ),
        { status: 503 }
      );
    return NextResponse.json({
      text,
      language: 'en',
      provider,
      mode: user.demo ? 'demo' : 'live',
    });
  } catch (e) {
    return jsonError(e);
  }
}
