import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { createDatabase, users } from '@bro/db';
import { requireUser } from '@/lib/auth';
import { demoStore } from '@/lib/demo-store';
import { jsonError } from '@/lib/http';
const update = z.object({
  displayName: z.string().min(1).max(80),
  countryCode: z.string().length(2),
  countryName: z.string().min(2),
  timeZone: z.string().min(3),
});
export async function GET() {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    if (user.demo) return NextResponse.json(demoStore.getProfile());
    const database = createDatabase();
    close = database.close;
    const [profile] = await database.db
      .select()
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    return profile
      ? NextResponse.json(profile)
      : NextResponse.json(
          { error: 'Complete onboarding to create your Bro profile.' },
          { status: 404 }
        );
  } catch (e) {
    return jsonError(e);
  } finally {
    await close?.();
  }
}
export async function PATCH(req: Request) {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    const body = update.parse(await req.json());
    if (user.demo) return NextResponse.json(demoStore.updateProfile(body));
    const database = createDatabase();
    close = database.close;
    const [profile] = await database.db
      .insert(users)
      .values({ id: user.id, ...body, onboardingState: 'connections' })
      .onConflictDoUpdate({
        target: users.id,
        set: { ...body, onboardingState: 'connections', updatedAt: new Date() },
      })
      .returning();
    return NextResponse.json(profile);
  } catch (e) {
    return jsonError(e);
  } finally {
    await close?.();
  }
}
