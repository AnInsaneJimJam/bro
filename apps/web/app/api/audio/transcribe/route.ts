import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { jsonError } from '@/lib/http';
import { validateCommandAudio } from '@/lib/audio';
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    enforceRateLimit(`audio:${user.id}`, 10, 60_000);
    const key = process.env.OPENAI_API_KEY;
    if (!key)
      throw Object.assign(
        new Error(
          'OpenAI audio transcription is not configured. Add OPENAI_API_KEY to use recorded commands.'
        ),
        { status: 503 }
      );
    const form = await req.formData(),
      file = form.get('audio');
    if (!(file instanceof File)) throw new Error('Audio file is required');
    validateCommandAudio(file);
    const client = new OpenAI({ apiKey: key });
    const transcript = await client.audio.transcriptions.create({
      file,
      model: process.env.OPENAI_COMMAND_TRANSCRIPTION_MODEL || 'gpt-transcribe',
      language: 'en',
    });
    return NextResponse.json({
      text: transcript.text,
      language: 'en',
      mode: user.demo ? 'demo' : 'live',
    });
  } catch (e) {
    return jsonError(e);
  }
}
