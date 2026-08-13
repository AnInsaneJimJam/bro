import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { createDatabase, scripts } from '@bro/db';
import { requireUser } from '@/lib/auth';
import { jsonError } from '@/lib/http';

const input = z.object({
    section: z.enum(['hook', 'beat', 'cta']),
    beatIndex: z.number().int().min(0).optional(),
    instruction: z.string().min(3).max(500),
  }),
  output = z.object({ text: z.string().min(1), rationale: z.string() });
export async function POST(
  request: Request,
  context: { params: Promise<{ scriptId: string }> }
) {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    if (user.demo)
      return NextResponse.json({
        text: 'A sharper demo suggestion that keeps the creator in control.',
        rationale: 'Demo suggestion only; it is not stored automatically.',
        demo: true,
      });
    const body = input.parse(await request.json()),
      { scriptId } = await context.params;
    z.string().uuid().parse(scriptId);
    const database = createDatabase();
    close = database.close;
    const [script] = await database.db
      .select()
      .from(scripts)
      .where(and(eq(scripts.id, scriptId), eq(scripts.userId, user.id)))
      .limit(1);
    if (!script)
      throw Object.assign(new Error('Owned script not found'), { status: 404 });
    const key = process.env.OPENAI_API_KEY;
    if (!key)
      throw Object.assign(
        new Error('OpenAI script regeneration is not configured'),
        { status: 503 }
      );
    const beats = (script.beats || []) as Array<{
        label: string;
        spoken: string;
      }>,
      current =
        body.section === 'hook'
          ? script.hook
          : body.section === 'cta'
            ? script.cta
            : beats[body.beatIndex ?? -1]?.spoken;
    if (!current) throw new Error('Selected script section does not exist');
    const response = await new OpenAI({ apiKey: key }).responses.parse({
      model:
        process.env.OPENAI_SCRIPT_MODEL ||
        process.env.OPENAI_TEXT_MODEL ||
        'gpt-5.6-luna',
      input: [
        {
          role: 'system',
          content:
            'Rewrite only the selected short-form script section. Preserve factual grounding, target duration, and creator intent. Return a suggestion; application code decides whether to apply it.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            title: script.title,
            duration: script.duration,
            section: body.section,
            current,
            instruction: body.instruction,
            context: { hook: script.hook, beats, cta: script.cta },
          }),
        },
      ],
      text: { format: zodTextFormat(output, 'script_section_suggestion') },
    });
    if (!response.output_parsed)
      throw Object.assign(
        new Error('The model returned no validated suggestion'),
        { status: 502 }
      );
    return NextResponse.json(response.output_parsed);
  } catch (error) {
    return jsonError(error);
  } finally {
    await close?.();
  }
}
