import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { jsonError } from '@/lib/http';
const allowed = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
]);
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    enforceRateLimit(`audio:${user.id}`, 10, 60_000);
    if (user.demo)
      return NextResponse.json(
        {
          error:
            'Audio transcription is unavailable in demo mode; no synthetic transcript is returned.',
        },
        { status: 409 }
      );
    const key = process.env.OPENAI_API_KEY;
    if (!key)
      throw Object.assign(
        new Error('OpenAI audio transcription is not configured'),
        { status: 503 }
      );
    const form = await req.formData(),
      file = form.get('audio');
    if (!(file instanceof File)) throw new Error('Audio file is required');
    if (!allowed.has(file.type)) throw new Error('Unsupported audio format');
    if (file.size <= 0 || file.size > 25 * 1024 * 1024)
      throw new Error('Audio command must be between 1 byte and 25 MB');
    const client = new OpenAI({ apiKey: key });
    const transcript = await client.audio.transcriptions.create({
      file,
      model: process.env.OPENAI_COMMAND_TRANSCRIPTION_MODEL || 'gpt-transcribe',
      language: 'en',
    });
    return NextResponse.json({ text: transcript.text, language: 'en' });
  } catch (e) {
    return jsonError(e);
  }
}
