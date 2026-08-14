import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { jsonError } from '@/lib/http';

type Check = {
  key: string;
  label: string;
  status: 'ready' | 'missing' | 'optional';
  detail: string;
};

export async function GET() {
  try {
    const user = await requireUser();
    if (user.demo)
      return NextResponse.json({
        mode: 'demo',
        checks: [
          {
            key: 'mode',
            label: 'Runtime mode',
            status: 'optional',
            detail:
              'Labeled demo data is enabled; no provider side effects run.',
          },
        ] satisfies Check[],
      });

    const checks: Check[] = [
      envCheck(
        'storage',
        'Supabase storage',
        ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
        'Private upload storage is ready.'
      ),
      envCheck(
        'database',
        'Database and durable jobs',
        ['DATABASE_URL'],
        'Postgres-backed state and worker queues are configured.'
      ),
      envCheck(
        'oauth-state',
        'OAuth security',
        ['OAUTH_STATE_SECRET'],
        'OAuth state signing is configured.'
      ),
      envCheck(
        'youtube',
        'YouTube OAuth',
        [
          'GOOGLE_CLIENT_ID',
          'GOOGLE_CLIENT_SECRET',
          'GOOGLE_REDIRECT_URI',
          'GOOGLE_SCOPES',
        ],
        'YouTube connection and publishing can be attempted.'
      ),
      envCheck(
        'instagram',
        'Instagram OAuth',
        [
          'INSTAGRAM_APP_ID',
          'INSTAGRAM_APP_SECRET',
          'INSTAGRAM_REDIRECT_URI',
          'INSTAGRAM_SCOPES',
        ],
        'Instagram connection can be attempted; account eligibility and review still apply.'
      ),
      {
        key: 'text-ai',
        label: 'Text AI',
        status:
          process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY
            ? 'ready'
            : 'missing',
        detail: process.env.GEMINI_API_KEY
          ? 'Gemini is configured for niche, topics, scripts, comments, and chat.'
          : process.env.OPENAI_API_KEY
            ? 'OpenAI fallback is configured for niche, topics, scripts, comments, and chat.'
            : 'Add a newly generated GEMINI_API_KEY to enable niche, topics, scripts, comments, and chat.',
      },
      {
        key: 'audio-commands',
        label: 'Recorded audio commands',
        status:
          process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY
            ? 'ready'
            : 'missing',
        detail: process.env.GEMINI_API_KEY
          ? 'Gemini can transcribe short recorded English commands.'
          : process.env.OPENAI_API_KEY
            ? 'OpenAI can transcribe recorded English commands.'
            : 'Add GEMINI_API_KEY or OPENAI_API_KEY to enable the microphone command button.',
      },
    ];
    return NextResponse.json({ mode: 'live', checks });
  } catch (error) {
    return jsonError(error);
  }
}

function envCheck(
  key: string,
  label: string,
  names: string[],
  readyDetail: string
): Check {
  const missing = names.filter((name) => !process.env[name]?.trim());
  return {
    key,
    label,
    status: missing.length ? 'missing' : 'ready',
    detail: missing.length ? `Missing ${missing.join(', ')}.` : readyDetail,
  };
}
