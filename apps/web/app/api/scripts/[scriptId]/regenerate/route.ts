import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { createDatabase, scripts } from '@bro/db';
import { requireUser } from '@/lib/auth';
import { jsonError } from '@/lib/http';
import { generateStructuredText } from '@bro/ai';
import { textProviderConfig } from '@/lib/text-ai';

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
    const result = await generateStructuredText(textProviderConfig('script'), {
      schema: output,
      schemaName: 'script_section_suggestion',
      system:
        'Rewrite only the selected short-form script section. Preserve factual grounding, target duration, and creator intent. Return a suggestion; application code decides whether to apply it.',
      user: JSON.stringify({
        title: script.title,
        duration: script.duration,
        section: body.section,
        current,
        instruction: body.instruction,
        context: { hook: script.hook, beats, cta: script.cta },
      }),
    });
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  } finally {
    await close?.();
  }
}
