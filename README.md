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
