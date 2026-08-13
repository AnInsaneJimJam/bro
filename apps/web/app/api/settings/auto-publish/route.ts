import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { auditEvents, createDatabase, users } from '@bro/db';
import { requireUser } from '@/lib/auth';
import { jsonError } from '@/lib/http';

const update = z.object({
  provider: z.enum(['youtube', 'instagram']),
  enabled: z.boolean(),
  confirmed: z.literal(true).optional(),
});

export async function GET() {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    if (user.demo)
      return NextResponse.json({ youtube: false, instagram: false });
    const database = createDatabase();
    close = database.close;
    const [profile] = await database.db
      .select({
        youtube: users.autoPublishYoutube,
        instagram: users.autoPublishInstagram,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    return NextResponse.json({
      youtube: profile?.youtube ?? false,
      instagram: profile?.instagram ?? false,
    });
  } catch (error) {
    return jsonError(error);
  } finally {
    await close?.();
  }
}

export async function PATCH(request: Request) {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    const body = update.parse(await request.json());
    if (body.enabled && body.confirmed !== true)
      return NextResponse.json(
        { error: 'Explicit confirmation is required to enable auto-publish.' },
        { status: 409 }
      );
    if (user.demo) {
      return NextResponse.json({
        mode: 'demo',
        provider: body.provider,
        enabled: body.enabled,
        persisted: false,
      });
    }
    const database = createDatabase();
    close = database.close;
    const field =
      body.provider === 'youtube'
        ? { autoPublishYoutube: body.enabled }
        : { autoPublishInstagram: body.enabled };
    await database.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(users)
        .set({ ...field, updatedAt: new Date() })
        .where(eq(users.id, user.id))
        .returning({ id: users.id });
      if (!updated)
        throw Object.assign(
          new Error('Complete onboarding before changing publishing settings.'),
          { status: 409 }
        );
      await tx.insert(auditEvents).values({
        userId: user.id,
        action: 'auto_publish.changed',
        resource: body.provider,
        outcome: body.enabled ? 'enabled' : 'disabled',
        metadata: { explicitConfirmation: body.enabled },
      });
    });
    return NextResponse.json({
      provider: body.provider,
      enabled: body.enabled,
    });
  } catch (error) {
    return jsonError(error);
  } finally {
    await close?.();
  }
}
