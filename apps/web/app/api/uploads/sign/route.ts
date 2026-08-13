import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/http';
import { sanitizeUploadFilename, allowedVideoMimeTypes } from '@bro/video';
const input = z.object({
  filename: z.string().min(1).max(240),
  mimeType: z.string(),
  size: z.number().int().positive(),
});
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    enforceRateLimit(`upload:${user.id}`, 20, 60_000);
    if (user.demo)
      return NextResponse.json(
        {
          error:
            'Signed uploads are unavailable in demo mode; no fake object-storage URL is returned.',
        },
        { status: 409 }
      );
    const body = input.parse(await req.json());
    if (!allowedVideoMimeTypes.has(body.mimeType))
      throw new Error('Unsupported video format');
    const max = Number(process.env.MAX_UPLOAD_BYTES || 536870912);
    if (body.size > max)
      throw new Error(`Video exceeds the ${max}-byte upload limit`);
    const safe = sanitizeUploadFilename(body.filename),
      projectId = crypto.randomUUID(),
      objectKey = `${user.id}/${projectId}/original/${safe}`,
      bucket = process.env.SUPABASE_ORIGINALS_BUCKET || 'bro-originals',
      admin = createSupabaseAdmin();
    const { data, error } = await admin.storage
      .from(bucket)
      .createSignedUploadUrl(objectKey);
    if (error) throw Object.assign(new Error(error.message), { status: 502 });
    return NextResponse.json({
      projectId,
      objectKey,
      bucket,
      signedUrl: data.signedUrl,
      token: data.token,
      expiresInSeconds: 120,
    });
  } catch (e) {
    return jsonError(e);
  }
}
