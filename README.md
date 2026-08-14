# Bro

Bro is a desktop-optimized responsive content manager for solo creators publishing English YouTube Shorts and Instagram Reels. It covers account connection, evidence-backed niche inference and topic opportunities, versioned short-form scripts, signed video uploads, direct multi-platform publishing, durable scheduling, and grounded analysis of owned-media comments. Subtitle generation and burn-in remain implemented as a later editing slice and do not block publishing.

Demo mode is visually labeled, never calls social platforms, and never reports a fake live publish.

## Repository layout

- `apps/web` — Next.js App Router UI, Supabase authentication, owned API routes, chat/audio commands, OAuth callbacks.
- `apps/worker` — long-running pg-boss worker for content/comment sync, transcription, rendering, and publishing.
- `packages/db` — Drizzle schema, migrations, inherited RLS policies, typed access, optional demo seed.
- `packages/core` — state machines, scheduling, authorization-safe validation, scoring, AES-256-GCM token encryption, redaction.
- `packages/integrations` — official YouTube, Instagram, and feature-flagged Reddit adapters.
- `packages/ai` — 18 strict application-tool schemas, Responses API loop, structured niche/script/opportunity/comment outputs.
- `packages/video` — MIME/metadata validation, cue segmentation/edit operations, ASS generation, shell-free FFmpeg/ffprobe execution.

The model never receives OAuth tokens. Application routes validate ownership and policy; durable workers perform external side effects. Timestamps are stored in UTC while scheduling intent retains the user's IANA time zone.

## Hackathon demo in two commands

The labeled demo workspace needs no database or social-platform credentials:

```bash
pnpm install
cp .env.example .env && pnpm dev
```

Open `http://localhost:3000` and choose **Continue with labeled demo data**. Keep `NEXT_PUBLIC_DEMO_MODE=true`. Add only `OPENAI_API_KEY` if you want microphone commands to use real English transcription; typed commands and the rest of the demo work without it.

Suggested three-minute walkthrough:

1. Show the evidence-backed confirmed niche and open **Ideas** to refresh scored, country-scoped opportunities.
2. Ask Bro: `Write a 45-second script for topic 2 with a contrarian hook`, then edit and save the generated script.
3. Upload a video in **Videos**, enter separate YouTube title/description and Instagram caption metadata, and show the publish confirmation.
4. Open **Calendar**, select the ready demo video, review the manual time slot, accept the confirmation, and point out the `scheduled · demo` card and no-platform-call notice.
5. Open **Comments** and analyze what viewers are confused about, noting the sample size, approximate sentiment notice, and representative evidence.

Demo mode never calls YouTube, Instagram, or Reddit. Calendar results are browser-local and explicitly labeled; they are not presented as live publishes.

## Local setup

Requirements: Node.js 22, pnpm 10, FFmpeg/ffprobe, PostgreSQL 16 or Supabase, and a Supabase project for live Auth/Storage.

```bash
cp .env.example .env
pnpm install
docker compose up -d postgres
pnpm --filter @bro/db db:migrate
pnpm --filter @bro/db db:seed   # optional, clearly labeled demo records
pnpm dev
```

In another terminal, start durable work:

```bash
pnpm dev:worker
```

Open `http://localhost:3000`. For a platform-free demo, retain `NEXT_PUBLIC_DEMO_MODE=true`. External social side effects remain disabled; optional microphone transcription requires the configured speech provider.

### Real-data credential checklist

Set `NEXT_PUBLIC_DEMO_MODE=false` and provide these values in `.env`. Never commit that file or paste secrets into the browser:

- **Gemini (preferred text/chat provider):** `GEMINI_API_KEY`. `GEMINI_TEXT_MODEL` and `GEMINI_SCRIPT_MODEL` are configurable model names, not additional keys. OpenAI remains an optional fallback for text and the separate speech/caption transcription paths.
- **Supabase:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and the server-only `SUPABASE_SERVICE_ROLE_KEY`, plus `DATABASE_URL` and `DATABASE_DIRECT_URL` for its Postgres database.
- **Bro security:** `TOKEN_ENCRYPTION_KEY` and `OAUTH_STATE_SECRET`, which you generate yourself; these are not third-party API keys.
- **YouTube:** `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from a Google Cloud Web OAuth client. No separate YouTube API key is needed for Bro's owned-channel, comment, and upload flows.
- **Instagram:** `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET` from Meta's direct Instagram Login setup. Live publishing and owned-media comments require a free Creator or Business professional account and the relevant Meta permissions/review; the official API does not support personal accounts for these features.
- **Reddit (optional):** `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET`; keep `REDDIT_INTEGRATION_ENABLED=false` until Reddit approves the intended use.
- **Error reporting (optional):** `SENTRY_DSN`.

Redirect URIs, scopes, API/model versions, bucket names, limits, and worker settings in `.env.example` are configuration rather than secrets, but they must match the corresponding provider console exactly.

### Supabase setup

1. Create private buckets named `bro-originals`, `bro-audio`, and `bro-renders` (or change the environment names).
2. Configure email magic-link authentication and add `${NEXT_PUBLIC_APP_URL}/api/auth/callback` to allowed redirects.
3. Apply `packages/db/migrations` to the Supabase Postgres database. The RLS policies use `auth.uid()` and scope both direct and inherited child records.
4. Put the anonymous key only in `NEXT_PUBLIC_SUPABASE_ANON_KEY`; keep the service-role key server/worker-only.
5. Generate `TOKEN_ENCRYPTION_KEY` with `openssl rand -base64 32`. Rotate by adding a new key version and re-encrypting stored connections before retiring the old key.

## Verification

```bash
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm format
```

The Playwright suite starts the demo web server and exercises desktop Chrome plus a mobile viewport. System Chrome is used when available. Unit/integration coverage includes OAuth-state rejection, token encryption/redaction and refresh, niche validation, trend scoring/expiry, script conflicts, caption operations and command construction, malicious media rejection, DST conversion, idempotency, partial publishing, auto-publish policy, grounded comment citations, and provider adapter behavior.

## Provider configuration and human review

No provider password is requested or stored.

### YouTube

1. Enable YouTube Data API v3 in Google Cloud.
2. Create a Web application OAuth client and register `GOOGLE_REDIRECT_URI` exactly.
3. Configure the minimum scopes in `.env`; Bro currently needs owned-channel read, comments, and upload capabilities.
4. Add test users during development. Complete OAuth verification before serving users outside the test list.
5. Monitor quota: search, upload, and comment methods have different costs. Bro uses bounded/manual sync rather than aggressive polling.

The adapter uses server-side OAuth, encrypted refresh tokens, quota/error mapping, and resumable upload. It has automated HTTP-contract tests but has not been verified against a real channel in this repository because credentials are not supplied.

### Instagram

1. Create a Meta app with **Instagram API with Instagram Login**, pin `INSTAGRAM_API_VERSION`, and register `INSTAGRAM_REDIRECT_URI`.
2. Connect an eligible Instagram Creator or Business professional account. This direct flow does not require a linked Facebook Page.
3. Request `instagram_business_basic`, `instagram_business_content_publish`, and `instagram_business_manage_comments`; submit the app and screencast for App Review.
4. Configure Meta's data deletion URL and privacy-policy URL before public launch.

Bro detects unsupported accounts, creates Reels containers close to execution, polls provider processing, and publishes via the official Graph API. Automated adapter-contract tests pass; live publishing still requires credentials, account eligibility, and review.

### Reddit

Set `REDDIT_INTEGRATION_ENABLED=false` until the intended use is approved under current Reddit terms. When approved, create a confidential web app with the exact redirect URI and a descriptive user agent. Bro reads only the connected user's bounded history and official hot/search signals; it does not publish, scrape, or use Reddit content for training.

### AI providers

Set `GEMINI_API_KEY` for live typed chat and structured text generation. OpenAI is an optional fallback for text; recorded commands use the configured speech provider and caption transcription uses `whisper-1` verbose JSON with word timestamps behind `TranscriptionProvider`.

## Deployment

Deploy two services from the same commit:

- Web: `apps/web/Dockerfile`, expose port 3000, command `pnpm --filter @bro/web start`.
- Worker: `apps/worker/Dockerfile`, no public port, command `node apps/worker/dist/index.js`.

On Railway, create web and worker services, attach the same Supabase/Postgres connection and secrets, set the web health check to `/`, and run `pnpm --filter @bro/db db:migrate` as a release command before either process starts. Install FFmpeg in the worker image (already included). Scale the worker cautiously because pg-boss provides durable delivery but provider quotas remain shared.

## Privacy and retention

Tokens are application-encrypted with authenticated encryption and key versioning. Private media uses short-lived signed URLs. Logs redact common secret fields. Disconnect attempts provider revocation and removes the connection. Account deletion attempts token revocation, removes original/audio/render objects, deletes the user-owned database graph, and removes the Supabase Auth user; any provider/storage cleanup warning is surfaced rather than hidden.

Recommended production retention: delete temporary extracted audio after caption approval or within seven days, expire trend runs after six hours, retain bounded normalized source/comment records only while the account remains connected, and delete all cached analyses with their owning user.

## Honest implementation status

The demo and production boundaries are implemented. Real OAuth exchanges, owned-content/comment sync, token refresh, YouTube resumable upload, Instagram Reels publishing, pg-boss scheduling, Supabase Storage processing, Responses tools, and FFmpeg worker paths exist. They are covered by unit/contract/browser tests but cannot be claimed as live-provider verified without human-supplied credentials and provider approvals.

Known code limitations:

- Instagram long-lived-token exchange/refresh strategy must be revalidated against the selected current Meta login product before launch.
- Production cross-user isolation is enforced in routes/RLS but still needs a credential-backed Supabase integration test environment.

Provider-policy/access limitations are distinct: Google verification, Meta App Review and account eligibility, Reddit approval, quota allocation, and real credential-backed publish verification remain human/provider-console work.

## Post-MVP roadmap

1. Richer Reels/Shorts editing: trimming, reframing, caption animation, B-roll, and music while preserving the current project model.
2. Automated quality/evaluation fixtures for scripts, niche inference, and comment grounding.
3. Suggested posting-time analytics while keeping manual scheduling authoritative.
4. Team/collaboration support only after the solo workflow is stable.
5. Additional networks through the existing adapter interfaces, not one-off integrations.
