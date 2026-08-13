import { NextResponse } from 'next/server';
import { z } from 'zod';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { and, desc, eq, ne } from 'drizzle-orm';
import { nicheOutput } from '@bro/ai';
import { creatorContentItems, createDatabase, nicheVersions } from '@bro/db';
import { requireUser } from '@/lib/auth';
import { demoStore } from '@/lib/demo-store';
import { jsonError } from '@/lib/http';

const requestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('infer') }),
  z.object({
    action: z.literal('confirm'),
    id: z.string().uuid(),
    label: z.string().min(2).max(100),
    subNiches: z.array(z.string().min(1).max(80)).max(3),
  }),
]);

export async function GET() {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    if (user.demo) return NextResponse.json(demoStore.listNiches());
    const database = createDatabase();
    close = database.close;
    return NextResponse.json(
      await database.db
        .select()
        .from(nicheVersions)
        .where(eq(nicheVersions.userId, user.id))
        .orderBy(desc(nicheVersions.createdAt))
    );
  } catch (error) {
    return jsonError(error);
  } finally {
    await close?.();
  }
}

export async function POST(request: Request) {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    const body = requestSchema.parse(await request.json());
    if (user.demo)
      return NextResponse.json(
        body.action === 'infer'
          ? demoStore.inferNiche()
          : demoStore.confirmNiche(body.id, body.label, body.subNiches)
      );
    const database = createDatabase();
    close = database.close;
    if (body.action === 'confirm') {
      const confirmed = await database.db.transaction(async (tx) => {
        const [owned] = await tx
          .select({ id: nicheVersions.id })
          .from(nicheVersions)
          .where(
            and(
              eq(nicheVersions.id, body.id),
              eq(nicheVersions.userId, user.id)
            )
          )
          .limit(1);
        if (!owned)
          throw Object.assign(new Error('Niche proposal not found'), {
            status: 404,
          });
        await tx
          .update(nicheVersions)
          .set({ status: 'archived', updatedAt: new Date() })
          .where(
            and(
              eq(nicheVersions.userId, user.id),
              eq(nicheVersions.status, 'confirmed'),
              ne(nicheVersions.id, body.id)
            )
          );
        const [result] = await tx
          .update(nicheVersions)
          .set({
            label: body.label,
            subNiches: body.subNiches,
            status: 'confirmed',
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(nicheVersions.id, body.id),
              eq(nicheVersions.userId, user.id)
            )
          )
          .returning();
        return result;
      });
      return NextResponse.json(confirmed);
    }
    const items = await database.db
      .select({
        provider: creatorContentItems.provider,
        sourceId: creatorContentItems.providerId,
        title: creatorContentItems.title,
        body: creatorContentItems.body,
        metrics: creatorContentItems.metrics,
        publishedAt: creatorContentItems.publishedAt,
      })
      .from(creatorContentItems)
      .where(eq(creatorContentItems.userId, user.id))
      .orderBy(desc(creatorContentItems.publishedAt))
      .limit(60);
    if (!items.length) {
      const [proposal] = await database.db
        .insert(nicheVersions)
        .values({
          userId: user.id,
          label: 'Tell Bro what you plan to create',
          subNiches: [],
          rationale:
            'No useful connected-account history was available. Describe your intended content before confirming a niche.',
          confidence: 0,
          evidence: [],
          sourceType: 'creator_plan_required',
          status: 'proposed',
        })
        .returning();
      return NextResponse.json({ ...proposal, insufficientData: true });
    }
    const key = process.env.OPENAI_API_KEY;
    if (!key)
      throw Object.assign(
        new Error('OpenAI niche inference is not configured'),
        { status: 503 }
      );
    const response = await new OpenAI({ apiKey: key }).responses.parse({
      model: process.env.OPENAI_TEXT_MODEL || 'gpt-5.6-luna',
      input: [
        {
          role: 'system',
          content:
            'Infer an English-language creator niche only from the supplied bounded owned-content records. Cite source IDs exactly. If evidence is weak, set insufficientData true. Never invent content.',
        },
        { role: 'user', content: JSON.stringify(items) },
      ],
      text: { format: zodTextFormat(nicheOutput, 'creator_niche') },
    });
    const result = response.output_parsed;
    if (!result)
      throw Object.assign(
        new Error('The niche model returned no validated result'),
        { status: 502 }
      );
    const [proposal] = await database.db
      .insert(nicheVersions)
      .values({
        userId: user.id,
        label: result.primaryNiche,
        subNiches: result.subNiches,
        rationale: result.rationale,
        confidence: result.confidence,
        evidence: result.evidence,
        sourceType: result.insufficientData
          ? 'insufficient_data'
          : 'connected_content',
        status: 'proposed',
      })
      .returning();
    return NextResponse.json({
      ...proposal,
      insufficientData: result.insufficientData,
    });
  } catch (error) {
    return jsonError(error);
  } finally {
    await close?.();
  }
}
