import { NextResponse } from 'next/server';
import { validateToolCall } from '@bro/ai';
import { redactSecrets } from '@bro/core';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { executeToolThroughOwnedRoutes } from '@/lib/tool-api';
import { createDatabase } from '@bro/db';
import { executeAuditedTool } from '@/lib/tool-audit';

export async function POST(request: Request) {
  let close: (() => Promise<void>) | undefined;
  try {
    const user = await requireUser();
    enforceRateLimit(`tools:${user.id}`, 30, 60_000);
    const body = await request.json();
    if (!body || typeof body.name !== 'string')
      throw Object.assign(new Error('Tool name is required'), { status: 400 });
    const args = validateToolCall(body.name, body.arguments ?? {});
    if (user.demo)
      return NextResponse.json({
        mode: 'demo',
        tool: body.name,
        arguments: redactSecrets(args),
        summary: 'Validated demo tool call; no platform side effect occurred.',
      });
    const database = createDatabase();
    close = database.close;
    const result = await executeAuditedTool({
      database,
      userId: user.id,
      name: body.name,
      args: args as Record<string, unknown>,
      execute: () =>
        executeToolThroughOwnedRoutes(
          request,
          body.name,
          args as Record<string, unknown>
        ),
    });
    return NextResponse.json({ mode: 'live', tool: body.name, result });
  } catch (error) {
    const safe = error instanceof Error ? error.message : 'Invalid request';
    return NextResponse.json(
      { error: safe },
      { status: Number((error as { status?: number }).status ?? 400) }
    );
  } finally {
    await close?.();
  }
}
