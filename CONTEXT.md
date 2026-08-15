# Bro — implementation context and manual-test handoff

Last updated: 2026-08-15

This file is the current engineering handoff for the Bro hackathon project. It records what is implemented, what is deployed, what has been verified, and what still needs a human/provider test. It intentionally contains no passwords, OAuth tokens, API keys, or service-role secrets.

## Product decision currently in force

Bro is a desktop-optimized responsive web app for solo creators publishing English YouTube Shorts and Instagram Reels.

The active video scope is deliberately simple:

1. Upload one original video to private storage.
2. Validate it on a worker.
3. Enter separate YouTube title/description/visibility and Instagram caption metadata.
4. Publish immediately or schedule to YouTube, Instagram, or both.
5. Track each destination independently and retry only failed destinations.

Subtitle transcription, caption editing, and caption burn-in are deferred. Their lower-level video/database primitives remain in the repository for a later editing slice, but the active UI and live model tools do not offer subtitles and subtitles do not block publishing.

## Current repository and deployment

- Local repository: `/home/anand/bro`
- Branch: `main`
- Private GitHub repository: <https://github.com/AnInsaneJimJam/bro>
- Hosted web app: <https://web-production-d7f4c.up.railway.app>
- Railway project: `bro` (`f5f6a785-c748-4fb3-a18b-c74769fd469f`)
- Railway environment: `production`
- Supabase project URL: `https://gzexehiujwxfeddwsljx.supabase.co`
- Railway services: `web` and `worker`

Latest commits:

- `8bb24e5` — gate publishing by connection health (latest web deployment)
- `161196f` — harden live video publishing retries (latest worker deployment)
- `55fb53c` — surface live connection sync errors
- `99aa750` — wait for live content sync before niche inference
- `c76d529` — decouple publishing from subtitle status

Verified deployment state at the time of this handoff:

- Web deployment `df95f36e-dead-4efa-a28b-fe207e8e689d`: `SUCCESS`
- Worker deployment `6161f68a-4b16-4c85-80ef-bb5eae1cfc17`: `SUCCESS`
- Worker log confirms all queues are running: `sync-content`, `validate-video`, `transcribe-video`, `render-video`, `publish-video`, `sync-comments`, and `refresh-recent-comments`.
- Hosted `/` returned HTTP 200.
- Hosted protected API requests without a session returned HTTP 401.
- Hosted web mode is configured with `NEXT_PUBLIC_DEMO_MODE=false`.

The Railway CLI may print a harmless Rust broken-pipe warning when its output is piped to `head`; it does not indicate a failed deployment.

## Current external-state evidence

The live database was checked with an aggregate, read-only query. At the last check:

- Auth users: 1
- Bro profiles: 3 (some are seed/test records)
- Live platform connections: 0
- Synced live content items: 0
- Video projects: 3 (existing test/seed records)
- Publish jobs: 0

Therefore no real YouTube or Instagram publish has been credential-verified yet. The blocker is not an unimplemented publish route; a user still needs to complete OAuth and supply an account that the provider allows the app to access.

The hosted environment has the expected Google/Instagram/Supabase/security configuration variables present. Text AI is now provider-configurable with OpenRouter/Nemotron preferred, Gemini optional, and OpenAI optional. Uploading and publishing do not require an AI key. Niche inference, topic synthesis, script generation, typed AI chat, and comment analysis require a text provider; recorded audio commands additionally require Gemini or OpenAI because Nemotron is text-only.

The Gemini key previously pasted in chat was not stored or deployed. It should be revoked and replaced with a fresh key before enabling AI.

## Repository architecture

```text
apps/web                  Next.js App Router UI, auth, API routes, OAuth callbacks
apps/worker               long-running pg-boss worker and provider side effects
packages/db               Drizzle schema, migrations, typed database helpers, seed
packages/core             domain state machines, scheduling, authorization, scoring,
                          encryption and redaction helpers
packages/integrations     YouTube, Instagram, Reddit adapters and provider errors
packages/ai               OpenRouter/Nemotron, Gemini/OpenAI text/tool loops, strict schemas, transcription
packages/video             ffprobe/FFmpeg validation, normalization and caption primitives
```

The browser never receives provider access/refresh tokens, OpenAI/Gemini keys, or the Supabase service-role key. OAuth tokens are encrypted application-side with authenticated encryption before storage. Provider calls and large-media processing happen server-side or in the worker.

## Implemented functionality

### Landing, authentication, and onboarding

- Polished landing page with live/demo labeling and a clear YouTube/Instagram connection path.
- Supabase email/password sign-up/sign-in and magic-link flow.
- Supabase Google sign-in button with the same safe callback; Google sign-in identifies the Bro user but does not replace the separate YouTube connection OAuth. The browser obtains the public Supabase URL/key from a no-store same-origin route so Railway runtime configuration works even when Next.js public variables were not present during image build.
- OAuth callback for Bro authentication with safe `next` path validation.
- Display name, searchable ISO country selector, country code/name, and IANA time-zone storage.
- One connection per provider per Bro user through a database uniqueness constraint.
- Onboarding can skip connections, but niche inference is only enabled after the content-sync job finishes.
- Connection health, reconnect, disconnect, missing-scope indication, and last provider error are visible.
- The live Videos panel now reads connection health and disables unavailable destination checkboxes with direct reconnect links.

### OAuth and provider adapters

- YouTube server-side OAuth with PKCE/state, refresh-token storage, owned-channel probe, owned content sync, comments, and resumable uploads.
- Instagram API with Instagram Login OAuth flow, short-to-long-lived token exchange, professional-account probe, owned media sync, Reels container publishing, processing polling, and owned comments.
- Instagram requires an eligible Creator or Business professional account for these live capabilities. Personal accounts are not silently treated as publishable.
- Reddit OAuth/content adapter exists behind `REDDIT_INTEGRATION_ENABLED=false`; Reddit publishing is not implemented.
- Provider errors are mapped to safe internal messages with retryability and no raw token/payload logging.
- Token refresh is implemented for YouTube/Reddit refresh tokens and Instagram long-lived tokens; reconnect-required states are persisted when refresh authorization fails.

### Content sync, niche, ideas, scripts, and comments

- Normalized owned content records for YouTube/Instagram (and gated Reddit).
- Durable sync jobs with visible queued/processing/completed/error status.
- Niche inference stores proposed versions, confidence, rationale, evidence, and insufficient-data state; a niche must be confirmed/edited before opportunity discovery.
- Country/niche topic opportunities use time-bounded official signals and deterministic score components before AI synthesis.
- Script generation/editing/versioning/duplicate/regenerate routes and UI exist.
- Comment sync is restricted to owned posts; filters include provider/post/date/keyword.
- Comment analysis is grounded in the selected stored sample and exposes sample size, sync time, approximate sentiment caveat, and representative references.
- AI is provider-configurable. OpenRouter/Nemotron Chat Completions with strict Zod validation and function calling is preferred when `OPENROUTER_API_KEY` is present; Gemini REST and OpenAI remain optional fallbacks. Audio command transcription still uses Gemini/OpenAI.
- OpenRouter user-facing requests use `OPENROUTER_TIMEOUT_MS` (default 45 seconds), no SDK retries, and no reasoning trace for structured topic/script generation. Topic discovery sends only the top 12 scored official signals to the model; if the free provider times out or is rate-limited, Bro stores clearly labeled deterministic signal cards. Script creation similarly saves a clearly labeled editable quick draft when the model is unavailable, so a provider queue cannot hold a Railway request for five minutes.

### Upload and video processing

- Browser requests a private Supabase signed-upload URL; the large file does not pass through a serverless request body.
- Uploaded object keys are user/project scoped and checked server-side.
- Worker downloads the original privately, runs `ffprobe`, validates actual MIME/container, size, duration, and media metadata.
- Non-compatible uploads can be normalized to H.264/AAC/48 kHz MP4 for publishing; original upload remains preserved.
- Original and derivative objects are kept in private storage buckets with short-lived signed preview URLs.
- Worker states and retryable validation failures are visible in the UI.
- Upload UI now catches network/storage/finalization errors, clears the file input for retry, and shows explicit progress states.
- Subtitle/caption UI and live AI subtitle tools are intentionally disabled for this MVP.

### Publishing and scheduling

- Separate metadata: YouTube title/description/visibility and Instagram caption.
- One uploaded project can target YouTube, Instagram, or both.
- Auto-publish defaults off independently per platform; confirmation is required when off.
- Durable pg-boss jobs survive web-process restarts.
- Calendar supports manual future date/time selection, local IANA time-zone intent, cancellation, and rescheduling.
- Publish state machine includes scheduled/processing/uploading/published/partially-published/cancelled/retryable/permanent failure states.
- Each destination is tracked separately. A successful destination is not republished when the other destination is retried.
- YouTube uses resumable upload and processing-status polling.
- Instagram creates a Reels container close to execution, polls processing, then calls `media_publish`.
- Idempotency/singleton keys prevent duplicate worker delivery where supported.
- Instagram retry hardening preserves the container ID on status or publish errors and treats permalink lookup as optional after a successful publish, reducing duplicate-Reel risk.
- External media IDs and canonical URLs are persisted in destination/social-post records.

### Security and operations

- RLS migrations and route-level ownership checks are present across user-owned records.
- OAuth state and PKCE verification, minimum configured scopes, secure cookies, signed URLs, rate limits, safe filenames, MIME sniffing/ffprobe validation, and secret redaction are implemented.
- Account disconnect attempts provider revocation and removes the stored connection.
- Account deletion route removes user-owned database/media records and attempts token/storage cleanup.
- Web and worker Dockerfiles exist; worker image installs FFmpeg.
- Railway web/worker services are deployed from the private repository; no CI/CD pipeline was added because the hackathon does not require it.

### Clearly labeled demo mode

- Demo mode is available for local walkthroughs and automated browser tests.
- Demo data is visibly labeled and never calls YouTube, Instagram, Reddit, or a fake live-storage URL.
- Demo calendar changes are browser-local and explicitly not durable platform jobs.
- Hosted production mode is disabled for demo data.

## Verification already completed

The current source has passed:

```bash
pnpm typecheck
pnpm test --run       # 26 files, 83 tests passed
pnpm build
pnpm test:e2e         # 19 passed, 1 intentionally skipped
```

The unit/integration suite covers OAuth-state rejection, token encryption/redaction/refresh, structured AI validation, niche insufficient-data handling, trend scoring/expiry, script version conflicts, caption primitives, malicious media rejection, FFmpeg render/normalization, DST conversion, idempotency, partial publishing, auto-publish policy, grounded comment citations, and adapter contracts.

The Playwright suite runs the labeled demo server and covers desktop/mobile landing/onboarding, navigation, chat follow-ups, deferred subtitle messaging, auto-publish confirmation, calendar scheduling, direct multi-platform metadata publishing UI, comment evidence, and security headers. It does not prove a real provider upload because no provider account is connected.

## Manual live test checklist

Use the hosted app for this test. Do not paste tokens or API keys into chat or browser fields.

### 1. Bro account

- Open <https://web-production-d7f4c.up.railway.app>.
- Sign in with Google, or create a Bro account with email/password or magic link.
- Confirm the email if Supabase requires it.
- Sign in and verify that `/onboarding` opens.

Expected: no demo label, no provider password request, and the landing page leads to authentication.

For Google sign-in, enable the Google provider in Supabase Auth → Providers and configure the provider's OAuth client with `https://<project-ref>.supabase.co/auth/v1/callback`. This is separate from Bro's YouTube OAuth client and callback.

### 2. Profile and country

- Enter a display name.
- Search and select the intended country.
- Confirm the displayed time zone.
- Continue.

Expected: profile saves and the selected ISO country/time zone remains after refresh.

### 3. YouTube OAuth

- Click Connect YouTube.
- Complete Google consent with the configured test user/channel.
- Return to onboarding.
- Verify account name and `Connected` status.
- Click sync/continue and wait until the sync status says completed.

Expected errors and meaning:

- Redirect URI mismatch: Google Cloud callback does not exactly match `GOOGLE_REDIRECT_URI`.
- App not verified/test-user error: add the Google account as an OAuth test user or complete Google verification.
- No channel available: the Google account has no usable YouTube channel.
- Missing/expired permission: reconnect; do not paste the token.

### 4. Instagram OAuth

- Click Connect Instagram.
- Use an eligible professional Creator/Business account and approve the requested scopes.
- Return to onboarding and verify the account name/status.
- Sync owned media.

Expected errors and meaning:

- Redirect URI error: Meta’s Instagram Login callback must exactly match `INSTAGRAM_REDIRECT_URI`.
- Unsupported account: the account is personal or the app/product/permissions are not eligible.
- Permission/review error: the app needs the configured Meta permissions and appropriate development/test-user or App Review access.

### 5. Niche and ideas (requires AI key for model synthesis)

- Click Find my niche after sync completes.
- Review evidence and confidence.
- Edit if needed and confirm.
- Refresh Ideas.

If `GEMINI_API_KEY` is absent, the expected result is a clear “Text AI is not configured” message, not fabricated niche/trend data.

### 6. Upload and publish one platform

- Open Videos.
- Upload a real MP4/MOV/WebM file under the configured 50 MB and 60-second limits.
- Wait for `ready` validation.
- Select one connected destination.
- Enter a YouTube title/description/visibility or Instagram caption.
- For the first real test, use YouTube `unlisted` or `private`.
- Publish now.
- Check Calendar/job status and the provider’s returned URL/media ID.

Expected state progression: upload queued → validation → ready → confirmation (when auto-publish is off) → scheduled/processing → uploading → published or a clear provider failure.

### 7. Upload and publish both platforms

- Upload/select a ready video.
- Select both destinations.
- Keep metadata independently filled: YouTube has title/description; Instagram has caption.
- Confirm the external publish.
- Verify both destination cards separately.

If one provider succeeds and the other fails, the UI must show partial success. Retry must only retry the failed destination.

### 8. Scheduling and cancellation

- Select a future manual time in Calendar.
- Verify the displayed IANA time zone.
- Schedule one or both destinations.
- Reschedule before execution, then cancel a scheduled job.

Expected: timestamps are stored/queued in UTC while the selected local intent remains visible. No automatic “best time” is used.

### 9. Comments

- After a post exists, run manual comment sync.
- Filter by provider/post/date/keyword.
- Analyze the selected sample.

Expected: the result reports the exact sample size/sync time and only cites comments inside the selected filter.

### 10. Disconnect/reconnect and privacy

- Disconnect one provider.
- Verify it disappears from the connection list and publishing is gated with a reconnect link.
- Reconnect it and confirm health returns.
- Do not use the account-delete action unless you intentionally want to remove that user’s data.

## How to report a manual-test issue

Send:

- numbered checklist step;
- exact button/command used;
- visible error text and HTTP status if shown;
- provider (YouTube/Instagram/Supabase/Railway);
- approximate time and whether it was local or hosted;
- screenshot if useful.

Never send access tokens, refresh tokens, client secrets, service-role keys, database passwords, or full provider error payloads containing credentials. Redact email addresses if they are not needed.

## Remaining work

### Required before calling the live MVP verified

1. A human must connect a real YouTube channel and eligible Instagram professional account through the hosted OAuth flow.
2. Run the credential-backed sync, upload, single-platform publish, two-platform publish, partial-failure retry, schedule, cancel, and comment-sync tests above.
3. Configure a fresh `GEMINI_API_KEY` if AI niche/scripts/chat/audio commands are required, then manually test those paths.
4. Resolve any provider-console callback, test-user, scope, quota, or account-eligibility issues exposed by those tests.
5. Complete Google/Meta provider review and data-deletion/privacy setup before inviting users outside provider test accounts.
6. Enable and manually test the Supabase Google provider using a Google OAuth client configured with Supabase's callback URL.

### Known code limitations

- No real provider publish has been verified in this repository because no account is connected.
- Instagram long-lived-token exchange/refresh behavior must be revalidated against the exact Meta product/API version selected in the provider console before public launch.
- A credential-backed Supabase/RLS integration test with two real users is still missing; route-level ownership checks and RLS migrations exist.
- AI paths return a configuration error when no OpenRouter/Gemini/OpenAI text key is configured; recorded audio commands separately require Gemini/OpenAI. They must not fall back to fabricated live data.
- Subtitle transcription, caption editing, caption rendering, and subtitle tool commands are intentionally deferred.
- Upload progress is state-based rather than byte-progress based; Supabase signed upload is used directly from the browser.
- Provider APIs can reject media, permissions, quotas, or accounts even when the application code is healthy; those errors must be handled as provider limitations, not hidden.

### Explicitly out of scope for this hackathon MVP

- Personal Instagram account publishing or access to non-owned media.
- Facebook, LinkedIn, Discord, TikTok, or Reddit publishing.
- Long-form YouTube videos.
- Native desktop/mobile apps.
- Teams, roles, approvals, multiple accounts per platform, billing, DMs, automatic replies/moderation.
- AI-generated video, trimming, transitions, reframing, B-roll, music, thumbnails, or multitrack editing.
- Fully autonomous topic selection/posting without creator-selected content.

### Later roadmap

1. Reintroduce the caption/subtitle editing slice: word timestamps, cue editor, style controls, FFmpeg burn-in, and rendered-variant publishing.
2. Add richer vertical editing (trim/reframe/B-roll/music) while preserving the current project model.
3. Add evaluation fixtures and model-quality monitoring for niche, scripts, trends, and comments.
4. Add suggested posting-time analytics while keeping manual scheduling authoritative.
5. Add collaboration and additional networks only after the solo creator workflow is stable.

## Useful commands

```bash
# Local labeled demo
pnpm install
cp .env.example .env
pnpm dev

# Local worker (separate terminal)
pnpm dev:worker

# Verification
pnpm typecheck
pnpm test --run
pnpm test:e2e
pnpm build
pnpm format

# Git/deployment (from the linked Railway project)
git status
git log -3 --oneline
railway up --service web --detach
railway up --service worker --detach
```

For live local mode, set `NEXT_PUBLIC_DEMO_MODE=false`, configure Supabase/Auth/Storage/database/security variables, set exact OAuth redirect URIs, and run the worker. Never commit `.env` or print Railway variables wholesale.
