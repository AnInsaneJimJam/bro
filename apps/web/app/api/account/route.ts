import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { decryptSecret } from '@bro/core';
import {
  createDatabase,
  platformConnections,
  users,
  videoProjects,
} from '@bro/db';
import { revokeProviderToken } from '@bro/integrations';
import { requireUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/http';

export async function DELETE() {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    if (user.demo)
      return NextResponse.json(
        { error: 'Demo mode has no account data to delete.' },
        { status: 409 }
      );
    const keyRaw = process.env.TOKEN_ENCRYPTION_KEY;
    if (!keyRaw)
      throw Object.assign(new Error('Token encryption is not configured'), {
        status: 503,
      });
    const database = createDatabase();
    close = database.close;
    const [connections, projects] = await Promise.all([
      database.db
        .select()
        .from(platformConnections)
        .where(eq(platformConnections.userId, user.id)),
      database.db
        .select({
          originalKey: videoProjects.originalKey,
          renderedKey: videoProjects.renderedKey,
          metadata: videoProjects.metadata,
        })
        .from(videoProjects)
        .where(eq(videoProjects.userId, user.id)),
    ]);
    const warnings: string[] = [],
      key = Buffer.from(keyRaw, 'base64');
    for (const connection of connections)
      try {
        await revokeProviderToken(
          connection.provider as 'youtube' | 'instagram' | 'reddit',
          decryptSecret(
            connection.encryptedAccessToken as Parameters<
              typeof decryptSecret
            >[0],
            key
          ),
          {
            clientId:
              connection.provider === 'reddit'
                ? process.env.REDDIT_CLIENT_ID
                : undefined,
            clientSecret:
              connection.provider === 'reddit'
                ? process.env.REDDIT_CLIENT_SECRET
                : undefined,
            apiVersion: process.env.INSTAGRAM_API_VERSION,
            userAgent: process.env.REDDIT_USER_AGENT,
          }
        );
      } catch {
        warnings.push(
          `${connection.provider} token revocation could not be confirmed; revoke it in the provider console.`
        );
      }
    const admin = createSupabaseAdmin(),
      removals = [
        {
          bucket: process.env.SUPABASE_ORIGINALS_BUCKET || 'bro-originals',
          keys: projects.flatMap((project) =>
            project.originalKey ? [project.originalKey] : []
          ),
        },
        {
          bucket: process.env.SUPABASE_RENDERS_BUCKET || 'bro-renders',
          keys: projects.flatMap((project) =>
            [
              project.renderedKey,
              (project.metadata as { publishObjectKey?: string } | null)
                ?.publishObjectKey,
            ].filter((key): key is string => Boolean(key))
          ),
        },
        {
          bucket: process.env.SUPABASE_AUDIO_BUCKET || 'bro-audio',
          keys: projects.flatMap((project) => {
            const key = (project.metadata as { audioObjectKey?: string } | null)
              ?.audioObjectKey;
            return key ? [key] : [];
          }),
        },
      ];
    for (const removal of removals)
      if (removal.keys.length) {
        const result = await admin.storage
          .from(removal.bucket)
          .remove(removal.keys);
        if (result.error)
          warnings.push(`${removal.bucket} cleanup: ${result.error.message}`);
      }
    await database.db.delete(users).where(eq(users.id, user.id));
    const auth = await admin.auth.admin.deleteUser(user.id);
    if (auth.error)
      warnings.push(`Authentication record cleanup: ${auth.error.message}`);
    return NextResponse.json({ deleted: true, warnings });
  } catch (error) {
    return jsonError(error);
  } finally {
    await close?.();
  }
}
