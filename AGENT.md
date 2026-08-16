# AGENT.md

Instructions for an AI coding agent (or a human following along) to clone this
repository and get it running end to end, from zero to a working local
instance with the operator's own credentials. Follow the steps in order. Each
step names the exact command to run and how to verify it succeeded before
moving on.

If you are an agent operating autonomously: **do not invent, guess, or reuse
credentials from any other project.** Every secret in this document must come
from the human operator or be generated locally with the exact command shown.
Never print a secret value back to the user once it has been written to
`.env` — confirm it was set by naming the variable, not by echoing it.

## 0. Decide the setup tier

Ask the operator (or infer from their request) which tier they want, since
each has a different amount of setup:

| Tier            | What it needs                                                                                             | What it gets                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Demo**        | Nothing — no keys, no database                                                                            | Full UI against labeled sample data. Zero calls to any real provider.                                             |
| **Live, no AI** | A Supabase project                                                                                        | Real accounts, real uploads, real publishing. Niche/script/chat features return a clear "not configured" message. |
| **Live, full**  | Supabase + at least one text AI provider + a transcription provider + YouTube and/or Instagram OAuth apps | Everything, including AI-drafted scripts/metadata, captions, and live publishing.                                 |

Do the smallest tier that satisfies the request. Do not set up OAuth apps or
AI providers the operator didn't ask for.

## 1. Prerequisites

Verify each of these before continuing; do not proceed past a failing check
without telling the operator what's missing.

```bash
node --version     # must print v22.x
pnpm --version      # must print 10.x — corepack enable && corepack prepare pnpm@10.24.0 --activate if missing
ffmpeg -version     # required for the worker (video validation/normalization/captions)
ffprobe -version    # ships with ffmpeg
```

If `ffmpeg`/`ffprobe` are missing: Debian/Ubuntu `apt-get install -y ffmpeg`,
macOS `brew install ffmpeg`. The worker cannot validate or process uploads
without them, but the web app and demo mode work fine without them.

## 2. Clone and install

```bash
git clone <the-operator's-fork-or-this-repo-url>
cd bro
cp .env.example .env
pnpm install
```

Verify: `pnpm install` exits 0 and `node_modules/.pnpm` exists at the repo
root. This is a pnpm workspace (`pnpm-workspace.yaml`: `apps/*`, `packages/*`)
— always run package-scoped commands from the repo root with
`pnpm --filter <name>`, never `cd` into a package and run `pnpm` there.

## 3. Demo tier — stop here if this is all that's needed

```bash
pnpm dev
```

Open `http://localhost:3000`, choose **Continue with labeled demo data**.
`NEXT_PUBLIC_DEMO_MODE=true` is already the default in `.env.example`. No
further setup, no database, no worker process required. This tier is
sufficient for exploring or demoing the UI.

## 4. Live tier — provision Supabase

Everything past this point requires a Postgres database. Supabase provides
Postgres, Auth, and Storage together, which is what this app is built around;
using a bare Postgres instance instead means Auth and Storage must be built
separately and is out of scope for this guide.

1. Create a project at `https://supabase.com/dashboard` (ask the operator to
   do this if you don't have dashboard access — an agent should not create
   third-party accounts on the operator's behalf without explicit
   permission).
2. From **Project Settings → Database**, copy the connection string. Use the
   **session pooler** (port 5432) connection for `DATABASE_URL`, with
   `?sslmode=require` appended.
3. From **Project Settings → API**, copy the Project URL and the `anon` and
   `service_role` keys.
4. Set in `.env`:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   SUPABASE_SERVICE_ROLE_KEY=<service_role key>
   DATABASE_URL=<session pooler connection string>
   DATABASE_DIRECT_URL=<same, or the direct/non-pooled connection string>
   NEXT_PUBLIC_DEMO_MODE=false
   ```

   > [!WARNING]
   > `SUPABASE_SERVICE_ROLE_KEY` bypasses row-level security. It must only
   > ever be read server-side (`apps/web`, `apps/worker`) and must never be
   > exposed to the browser or committed to version control.

5. Create three **private** Storage buckets, named exactly:
   `bro-originals`, `bro-audio`, `bro-renders` (Supabase dashboard → Storage
   → New bucket → toggle **Private**). If the names differ, set
   `SUPABASE_ORIGINALS_BUCKET` / `SUPABASE_AUDIO_BUCKET` /
   `SUPABASE_RENDERS_BUCKET` to match instead of renaming the buckets.
6. Apply the schema and row-level-security policies:

   ```bash
   pnpm --filter @bro/db db:migrate
   ```

   Verify: the command exits 0 and prints each applied migration filename
   from `packages/db/migrations/`. If it fails with a TLS/certificate error,
   set `DATABASE_SSL_CA_PATH` to a CA bundle for your Postgres host, or drop
   `sslmode=require` if connecting to a local/non-TLS database instead.

7. Optional — seed clearly-labeled demo records into the live database:

   ```bash
   pnpm --filter @bro/db db:seed
   ```

## 5. Live tier — generate Bro's own secrets

These are generated locally, not obtained from any provider:

```bash
openssl rand -base64 32   # → TOKEN_ENCRYPTION_KEY
openssl rand -base64 32   # → OAUTH_STATE_SECRET
```

Set both in `.env`. Leave `TOKEN_ENCRYPTION_KEY_VERSION=1` (only increment it
when rotating the key against already-encrypted data).

## 6. Live tier — Supabase Auth

1. Dashboard → **Authentication → URL Configuration**: add
   `http://localhost:3000/api/auth/callback` (and the equivalent production
   URL later) to the redirect allow-list.
2. Email/password and magic-link auth work with no further setup.
3. Optional — Google sign-in (this is separate from the YouTube OAuth
   connection in step 7; it only identifies the Bro user): Dashboard →
   **Authentication → Providers → Google**, create a Google OAuth web client
   with authorized redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`,
   paste its client ID/secret into Supabase.

## 7. Live tier — provider OAuth apps (only set up what's needed)

Each provider needs its own console app. Register the exact redirect URI —
providers reject a mismatch outright, including trailing-slash differences.

### YouTube

1. Google Cloud Console → enable **YouTube Data API v3**.
2. Create an **OAuth 2.0 Client ID**, type **Web application**.
3. Authorized redirect URI: `http://localhost:3000/api/oauth/youtube/callback`
   (production: `https://<your-domain>/api/oauth/youtube/callback`).
4. Add the operator's own Google account as an OAuth **test user** while the
   app is unverified.
5. Set in `.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `GOOGLE_REDIRECT_URI` (matching exactly what was registered). Leave
   `GOOGLE_SCOPES` as shipped — it's already the minimum Bro needs
   (owned-channel read, `youtube.force-ssl` for comments, upload).

### Instagram

1. Meta for Developers → create an app → add product **Instagram API with
   Instagram Login** (not the older Basic Display product).
2. Redirect URI: `http://localhost:3000/api/oauth/instagram/callback`.
3. Set in `.env`: `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`,
   `INSTAGRAM_REDIRECT_URI`.
4. The account connecting must be an Instagram **Creator or Business**
   account — personal accounts cannot publish or expose owned comments
   through this API, and Bro will report that rather than pretending it
   works. Live publishing beyond the operator's own test account requires
   Meta App Review.

### Reddit (optional, off by default)

Leave `REDDIT_INTEGRATION_ENABLED=false` unless the operator has an approved
use case — Bro only reads a connected user's own history and official
signals through it; it does not publish or scrape. If enabling it, create a
confidential web app at Reddit's app preferences page with redirect URI
`http://localhost:3000/api/oauth/reddit/callback` and set
`REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET`/a descriptive `REDDIT_USER_AGENT`.

## 8. Live tier — AI providers (only set up what's needed)

Bro degrades gracefully with none of these configured: publishing and
uploads still work, and every AI-dependent screen shows a plain "not
configured" message instead of failing or fabricating output.

| Capability                                            | Preferred                                                                                 | Fallback order                        |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------- |
| Text (niche, topics, scripts, chat, comment analysis) | `OPENROUTER_API_KEY` (free Nemotron model, already set as the default `OPENROUTER_MODEL`) | → `GEMINI_API_KEY` → `OPENAI_API_KEY` |
| Video/caption transcription                           | `GROQ_API_KEY` (free Whisper, no observed reliability issues)                             | → `OPENAI_API_KEY` → `GEMINI_API_KEY` |
| Recorded voice commands                               | `GROQ_API_KEY`                                                                            | → `OPENAI_API_KEY` → `GEMINI_API_KEY` |

Get keys from `openrouter.ai`, `console.groq.com`, `aistudio.google.com`
(Gemini), or `platform.openai.com`. **Start with `OPENROUTER_API_KEY` and
`GROQ_API_KEY`** — both have usable free tiers and cover every AI feature in
the app between them; only add Gemini/OpenAI if the operator specifically
wants those models or hits free-tier limits.

## 9. Run it

```bash
pnpm dev            # apps/web on http://localhost:3000
pnpm dev:worker      # separate terminal — required for uploads, transcription,
                     # captions, content/comment sync, and publishing
```

The worker is not optional in the live tier: without it, uploads sit at
`queued` forever. Demo mode does not need it.

## 10. Verify the setup

```bash
pnpm typecheck
pnpm test
pnpm build
```

All three must pass with no changes made — this repository is expected to be
green out of the box. If any fail immediately after a fresh clone (not after
you've edited code), the environment is misconfigured, not the code; check
`.env` before debugging further.

Then, signed in to the running app (not demo mode), open **Settings** — the
"System readiness" panel calls `/api/system/status` and reports exactly
which providers are configured and which required OAuth scopes are missing,
without ever displaying a secret value. Use it to confirm step 7/8 actually
took effect before testing a feature manually.

`pnpm test:e2e` additionally runs the Playwright suite against the demo
server; it does not require any live credentials.

## Common failure modes

| Symptom                                                   | Cause                                                                                          | Fix                                                                                       |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `pnpm --filter @bro/db db:migrate` fails with a TLS error | Missing/wrong CA for the Postgres host                                                         | Set `DATABASE_SSL_CA_PATH`, or drop `sslmode=require` for a local DB                      |
| Upload stuck at `queued`                                  | Worker isn't running                                                                           | Start `pnpm dev:worker` in a separate terminal                                            |
| OAuth redirect error from the provider                    | Registered redirect URI doesn't exactly match `GOOGLE_REDIRECT_URI` / `INSTAGRAM_REDIRECT_URI` | Copy the value from `.env`, not from memory — trailing slashes and http/https both matter |
| "Text AI is not configured" everywhere                    | No `OPENROUTER_API_KEY`/`GEMINI_API_KEY`/`OPENAI_API_KEY` set                                  | Add one — see step 8                                                                      |
| Video uploads but never gets captions/drafted metadata    | No `GROQ_API_KEY`/`OPENAI_API_KEY`/`GEMINI_API_KEY` set, or worker not running                 | Add a transcription key (step 8) and confirm the worker is running                        |
| Instagram connects but publishing fails                   | Account is personal, not Creator/Business                                                      | Reconnect with an eligible professional account                                           |

## Rules for an agent working in this repository

- Never commit `.env`, print a secret to chat, or write a secret into a file
  other than `.env`.
- Never fabricate a working feature when a provider key is absent — the
  existing "not configured" messaging is intentional, not a bug to route
  around with a mock.
- The browser must never receive a provider access/refresh token, an AI
  provider key, or the Supabase service-role key. If a change would expose
  one of these client-side, stop and flag it instead of proceeding.
- Run `pnpm typecheck && pnpm test && pnpm build` before considering any
  change to `apps/` or `packages/` complete.
- Treat `apps/worker` as required infrastructure, not optional — a change
  that only works with the web process running is incomplete.
