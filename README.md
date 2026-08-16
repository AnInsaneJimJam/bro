<h1 align="center">
  <img src=".github/banner.png" width="300" alt="Bro">
</h1>

<p align="center"><b>A creator command center for solo YouTube Shorts and Instagram Reels publishers.</b></p>

<p align="center">
  <img src="https://img.shields.io/badge/node-22-339933?logo=node.js&logoColor=white" alt="Node 22">
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5.8">
  <img src="https://img.shields.io/badge/Next.js-15-black?logo=next.js&logoColor=white" alt="Next.js 15">
  <img src="https://img.shields.io/badge/pnpm-10-F69220?logo=pnpm&logoColor=white" alt="pnpm 10">
  <img src="https://img.shields.io/badge/Postgres-16-4169E1?logo=postgresql&logoColor=white" alt="Postgres 16">
</p>

Bro turns "I have a video" into "it's published" — one connected workspace for
finding a topic, drafting a script, uploading or recording the clip, drafting
its title/description/caption from the spoken audio, captioning it, and
publishing or scheduling it to YouTube and Instagram, with a chat assistant
that can drive the whole flow in plain English.

> [!NOTE]
> This is a hackathon project. Demo mode (`NEXT_PUBLIC_DEMO_MODE=true`) runs
> the full UI against labeled sample data with **zero** calls to YouTube,
> Instagram, or any AI provider, so anyone can try it without credentials.

## Features

- **Niche and topic discovery** — infers a creator's niche from synced owned
  content with evidence and a confidence score, then scores time-bounded
  topic opportunities for their niche and country.
- **Versioned scripts** — generates 15–60s vertical-video scripts from a topic
  (workspace-sourced or creator-supplied), with per-section regeneration and
  full version history.
- **Upload or record, then auto-draft** — upload a file or record straight
  from the browser camera; once it validates, Bro transcribes the spoken
  audio and drafts the YouTube title/description and Instagram caption for
  the creator to review.
- **English captions** — auto-generated from the same transcript, editable,
  and burned into the video with FFmpeg on request; publishing automatically
  uses the captioned render once one exists.
- **Multi-platform publishing** — publish now or schedule to YouTube Shorts
  and Instagram Reels independently, with durable delivery (pg-boss),
  auto-publish policy gating, and per-destination retry so one platform's
  failure never blocks the other.
- **Calendar** — a real month view of every scheduled and past post, with
  destination status and a link straight to the published result.
- **Comment intelligence** — syncs comments from owned posts and answers
  grounded questions about them, citing the exact comments it used.
- **Bro Chat** — a typed or voice-driven assistant that calls the same 19
  application tools as the UI (find topics, write a script, publish, schedule,
  analyze comments, and more), aware of the creator's timezone and any draft
  Bro already wrote so it doesn't ask for information it already has.

## Architecture

A pnpm/TypeScript monorepo. The browser never receives provider access
tokens, AI keys, or the Supabase service-role key — those stay server-side or
in the worker.

| Package                 | Responsibility                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`              | Next.js App Router UI, Supabase auth, owned API routes, chat/audio commands, OAuth callbacks                                    |
| `apps/worker`           | Durable [pg-boss](https://github.com/timgit/pg-boss) worker: content/comment sync, transcription, caption rendering, publishing |
| `packages/db`           | Drizzle schema, migrations, row-level-security policies, typed access, demo seed                                                |
| `packages/core`         | State machines, scheduling, authorization checks, scoring, AES-256-GCM token encryption                                         |
| `packages/integrations` | Official YouTube, Instagram, and feature-flagged Reddit adapters                                                                |
| `packages/ai`           | 19 strict Zod tool schemas, OpenRouter/Gemini/OpenAI tool loops, structured niche/script/comment outputs                        |
| `packages/video`        | MIME/metadata validation, caption cue segmentation, ASS generation, shell-free FFmpeg/ffprobe execution                         |

Timestamps are stored in UTC while a creator's scheduling intent retains
their IANA time zone.

## Quick start (demo mode)

No database or platform credentials needed:

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Open `http://localhost:3000` and choose **Continue with labeled demo data**.
Everything — Home, Ideas, Scripts, Upload, Calendar, Comments, Bro Chat — runs
against clearly labeled sample data. Nothing is ever sent to a real platform
in this mode.

## Local development (live data)

Requirements: Node.js 22, pnpm 10, FFmpeg/ffprobe, PostgreSQL 16 (or a
Supabase project for live Auth/Storage).

```bash
cp .env.example .env
pnpm install
docker compose up -d postgres
pnpm --filter @bro/db db:migrate
pnpm --filter @bro/db db:seed   # optional, clearly labeled demo records
pnpm dev
```

In a second terminal, start the durable worker (required for uploads,
transcription, captions, sync, and publishing):

```bash
pnpm dev:worker
```

Set `NEXT_PUBLIC_DEMO_MODE=false` in `.env` once real credentials are
configured (see below).

### Provider configuration

> [!WARNING]
> Never commit `.env` or paste secrets into chat or the browser. `TOKEN_ENCRYPTION_KEY` and `OAUTH_STATE_SECRET` are generated locally — they are not third-party API keys.

| Provider          | Variables                                                                                                | Used for                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Supabase          | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` | Auth, private Storage, Postgres                                                             |
| YouTube           | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                                                               | OAuth, owned-channel sync, resumable upload, comments                                       |
| Instagram         | `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`                                                               | OAuth, Reels publishing, owned comments (Creator/Business accounts only)                    |
| Groq              | `GROQ_API_KEY`                                                                                           | Preferred transcription provider — free Whisper, used for video captions and voice commands |
| OpenRouter        | `OPENROUTER_API_KEY`                                                                                     | Preferred text provider — niche inference, topics, scripts, chat, comment analysis          |
| Gemini / OpenAI   | `GEMINI_API_KEY` / `OPENAI_API_KEY`                                                                      | Fallback text and transcription providers                                                   |
| Reddit (optional) | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`                                                               | Gated behind `REDDIT_INTEGRATION_ENABLED=false` until approved                              |

See `.env.example` for the complete list, including model names, redirect
URIs, bucket names, and worker tuning — those are configuration, not secrets,
but must match the corresponding provider console exactly.

### Supabase setup

1. Create private buckets `bro-originals`, `bro-audio`, and `bro-renders`.
2. Enable email magic-link auth and the Google provider; add
   `${NEXT_PUBLIC_APP_URL}/api/auth/callback` to allowed redirects.
3. Apply `packages/db/migrations` — row-level-security policies scope every
   row (direct and inherited) to `auth.uid()`.
4. Keep the service-role key server/worker-only; only the anon key belongs in
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. Generate `TOKEN_ENCRYPTION_KEY` with `openssl rand -base64 32`.

## Verification

```bash
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm format
```

Unit/integration coverage includes OAuth-state rejection, token
encryption/redaction/refresh, niche validation, script version conflicts,
caption operations, malicious media rejection, DST conversion, idempotency,
partial publishing, auto-publish policy, grounded comment citations, and
provider adapter contracts. The Playwright suite runs the labeled demo server
across desktop and mobile viewports.

## Deployment

Two services from the same commit, each with its own Dockerfile:

- **Web** — `apps/web/Dockerfile`, port 3000, health check `/`.
- **Worker** — `apps/worker/Dockerfile`, no public port, FFmpeg preinstalled.

Attach the same Supabase/Postgres connection and provider secrets to both
services, and run `pnpm --filter @bro/db db:migrate` as a release step before
either process starts.

## Privacy and retention

Provider tokens are encrypted with authenticated encryption and key
versioning before storage; the browser never sees them. Private media is
served through short-lived signed URLs. Disconnecting a provider revokes its
token where the provider supports it; deleting an account revokes tokens,
removes original/audio/rendered media, and deletes the user's data graph.

## Coming features

- **Automatic comment replies** — draft and post on-brand responses to
  incoming comments, grounded in the same comment data Bro already
  analyzes, without reviewing every thread by hand.
- **Expanded video editing** — trim, reframe, and layer in B-roll and music
  directly in Bro, building on the existing caption pipeline.
- **Automatic scheduling** — let Bro propose publish times from a channel's
  own performance history, with manual scheduling remaining available.
- **Style preferences** — save a creator's preferred tone, formatting, and
  branding once and apply it to every generated script, caption, and
  drafted reply.
- **In-depth niche analysis with live web access** — ground niche and topic
  recommendations in real-time web research alongside synced owned-account
  history, rather than owned history alone.
