# Quill

An **agent-first** workspace for shipping better posts on X. You write with an
agent (Claude / Codex); Quill is the durable system that stores drafts, posts
on schedule, and runs your automations — plus a thin UI to review what the agent
proposed and approve what goes out.

```
quill/
├── frontend/   Next.js 15 · React 19 · Tailwind v4 · shadcn/ui   (review surface)
├── backend/    Fastify · Prisma · Postgres · worker · X OAuth 2.0 (the system)
└── agent/      (coming) MCP tools + voice doctrine — opened in Claude/Codex
```

- **Agent** = the brain. Drafts in your voice, decides what/when.
- **Backend** = hands + clock + memory. Holds X tokens, stores the queue, and a
  worker publishes due posts even when no agent is running. Runs the automations.
- **Frontend** = your window: review **drafts** the agent proposed, approve →
  schedule, and manage automations.

## Run it

Postgres runs in Docker (from `backend/`).

### Backend → http://localhost:8787

```bash
cd backend
cp .env.example .env          # fill X_CLIENT_ID / X_CLIENT_SECRET (+ API_KEY once deployed)
docker compose up -d          # Postgres
pnpm install && pnpm prisma:generate && pnpm prisma migrate dev
pnpm dev                      # API + worker
```

### Frontend → http://localhost:4310

```bash
cd frontend
npm install && npm run dev    # NEXT_PUBLIC_API_BASE_URL defaults to :8787
```

> Frontend runs on **4310**. If you change it, set the backend's `APP_BASE_URL`
> to match (drives CORS + the post-OAuth redirect).

## Connecting X

Create an app in the [X Developer Portal](https://developer.x.com) inside a
Project:

- **App permissions:** Read and write
- **Type of App:** Web App, Automated App or Bot (confidential client)
- **Callback URL:** `http://localhost:8787/api/x/callback`
- **Scopes:** `tweet.read users.read tweet.write media.write offline.access`

Copy the OAuth 2.0 Client ID + Secret into `backend/.env`, then **Connect X** in
Settings.

## The UI (two surfaces)

- **Queue** — Drafts the agent proposed (approve → schedule, or discard) and
  Scheduled posts the worker will publish (cancel anytime).
- **Automations** — CTA auto-plug (reply once when a post crosses a like
  threshold) and Auto-repost (recycle an evergreen post on a cadence).

Writing happens in the agent, not the UI.

## How the agent uses the backend

The agent (via MCP / REST, with a Bearer `API_KEY` once deployed) drives:

- `POST /api/posts/sync` — pulls your recent posts **incrementally** (only new
  since last sync; includes replies + the parent they answered) to learn voice.
- `GET /api/posts` — those posts, shaped for voice analysis.
- `POST /api/drafts` → `POST /api/drafts/:id/schedule` — propose, then you approve.
- `GET /api/scheduled-posts`, `/api/cta`, `/api/repost-rules` — queue + automations.

The worker (in the backend) is the clock: it publishes scheduled posts and runs
CTA/repost rules on time, independently of any agent session.
