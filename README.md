# Quill

An **agent-first** workspace for shipping better posts on X. You write with an
agent (Claude / Codex); Quill is the durable system that stores drafts, posts
on schedule, and runs your automations — plus a thin UI to review what the agent
proposed and approve what goes out.

```
quill/
├── frontend/   Next.js 15 · React 19 · Tailwind v4 · shadcn/ui   (review surface)
├── backend/    Fastify · Prisma · Postgres · worker · X OAuth 2.0 (the system)
└── agent/      `quill` CLI + skills + voice doctrine — opened in Claude/Codex
```

- **Agent** = the brain. Drafts in your voice, decides what/when.
- **Backend** = hands + clock + memory. Holds X tokens, stores the queue, and a
  worker publishes due posts even when no agent is running. Runs the automations.
- **Frontend** = your window: review **drafts** the agent proposed, approve →
  schedule, and manage automations.

## Self-hosted, single-owner

Everyone runs their **own** Quill: your instance, your X app, your database.
There's no shared server and no multi-user signup — the first visit asks you to
set an **owner password** that locks the instance to you. Everything else (X app
credentials, connecting your account, the agent key) is done **in the UI** under
Settings — no config-file editing beyond the initial `.env`.

## Run it

### Backend → http://localhost:8787

```bash
cd backend
cp .env.example .env          # set DATABASE_URL + two random secrets (see below)
docker compose up -d          # Postgres (or use any local Postgres — see below)
pnpm install && pnpm prisma:generate && pnpm prisma migrate dev
pnpm dev                      # API + worker
```

The only values `.env` needs are `DATABASE_URL`, `JWT_SECRET`, and
`ENCRYPTION_KEY_BASE64` (generate with `openssl rand -base64 32`). X credentials
are entered later in the UI.

**Without Docker** (e.g. macOS + Homebrew) — any Postgres on `localhost` works:

```bash
brew install postgresql@16 && brew services start postgresql@16
createdb quill
# in backend/.env:  DATABASE_URL="postgresql://<your-mac-user>@localhost:5432/quill"
cd backend && pnpm install && pnpm prisma migrate deploy && pnpm dev
```

### Frontend → http://localhost:4310

```bash
cd frontend
npm install && npm run dev    # NEXT_PUBLIC_API_BASE_URL defaults to :8787
```

> Frontend runs on **4310**. If you change it, set the backend's `APP_BASE_URL`
> to match (drives CORS + the post-OAuth redirect).

### First run — everything else is in the UI

1. Open http://localhost:4310 → **set your owner password** (claims the instance).
2. **Settings → X app credentials**: the page walks you through creating a free
   app at [developer.x.com](https://developer.x.com) (Read and write · Web App /
   confidential client · callback URL shown with a copy button) and pasting the
   OAuth 2.0 Client ID + Secret. Stored encrypted in your database.
3. **Settings → Connect X**: approve once on X.
4. **Settings → Your agent**: copy the generated agent key into `agent/.env`,
   open `agent/` in Claude Code or Codex, and say "bootstrap my voice".

## Deploy to Railway

Quill runs as **two Railway services** (backend + frontend) plus the managed
**PostgreSQL** plugin. The worker is fused into the backend process, so one
always-on backend service publishes on schedule — no separate worker to pay for.
Cost lands around the **$5/mo Hobby** floor. Build/start config lives in the
repo: [`backend/railway.json`](backend/railway.json) and
[`frontend/railway.json`](frontend/railway.json) (the backend runs
`prisma migrate deploy` on every deploy).

1. **New Project → add PostgreSQL** (the managed plugin; it provides `DATABASE_URL`).
2. **Backend service** — deploy from this repo, then in **Settings** set
   **Root Directory** `/backend` and **Config file** `/backend/railway.json`
   (the config path is *not* inferred from the root directory — set it
   explicitly, or `railway.json` is ignored). Add variables:
   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   JWT_SECRET=<openssl rand -hex 32>
   ENCRYPTION_KEY_BASE64=<openssl rand -base64 32>
   APP_BASE_URL=https://<frontend-domain>       # fill in after step 4
   API_BASE_URL=https://<backend-domain>        # fill in after step 4
   X_CALLBACK_URL=https://<backend-domain>/api/x/callback
   ```
3. **Frontend service** — deploy from this repo again; **Settings → Root
   Directory** `/frontend`, **Config file** `/frontend/railway.json`.
4. **Generate a public domain** for each service (**Settings → Networking**),
   fill in the backend cross-URLs above, and set the frontend's URL **before it
   builds** (`NEXT_PUBLIC_*` is inlined at build time):
   ```
   NEXT_PUBLIC_API_BASE_URL=https://<backend-domain>
   ```
   Then redeploy both — the frontend must **rebuild** to bake in its API URL.
5. Follow the **First run** steps above, pointed at your deployed frontend URL
   (register the X callback `https://<backend-domain>/api/x/callback` in your X app).

> **One-click button:** a "Deploy on Railway" button needs a *template* published
> once from the Railway dashboard — a `railway.json` describes a single service
> and can't declare two services + a database. After publishing one, add:
> `[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template/<CODE>)`

## The UI (two surfaces)

- **Queue** — Drafts the agent proposed (approve → schedule, or discard) and
  Scheduled posts the worker will publish (cancel anytime).
- **Automations** — CTA auto-plug (reply once when a post crosses a like
  threshold) and Auto-repost (recycle an evergreen post on a cadence).

Writing happens in the agent, not the UI.

## How the agent uses the backend

The agent (via the `quill` CLI in `agent/`, or the REST API directly,
authenticated with the agent key from Settings) drives:

- `POST /api/posts/sync` — pulls your recent posts **incrementally** (only new
  since last sync; includes replies + the parent they answered) to learn voice.
- `GET /api/posts` — those posts, shaped for voice analysis.
- `POST /api/drafts` → `POST /api/drafts/:id/schedule` — propose, then you approve.
- `GET /api/scheduled-posts`, `/api/cta`, `/api/repost-rules` — queue + automations.

The worker (in the backend) is the clock: it publishes scheduled posts and runs
CTA/repost rules on time, independently of any agent session.
