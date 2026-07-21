# Quill

An MCP-first workspace for shipping better posts on X. Codex or Claude uses the
deployed Quill MCP; Quill stores drafts, posts on schedule, and runs
automations — plus a thin UI to review and approve what goes out.

```
quill/
├── frontend/   Next.js 15 · React 19 · Tailwind v4 · shadcn/ui   (review surface)
├── backend/    Fastify · Prisma · SQLite · worker · X OAuth 2.0  (the system)
├── frontend/   Next.js review surface + Fumadocs reference at /docs
└── extension/  Chrome MV3 companion — capture X research, never publish
```

- **MCP** = the agent interface. It resolves the correct person's private
  profiles, research, drafts, media, queue, and X account from one deployed URL.
- **Backend** = hands + clock + memory. Holds X tokens, stores the queue, and a
  worker publishes due posts even when no agent is running. Runs the automations.
- **Frontend** = your window: review **drafts** the agent proposed, approve →
  schedule, and manage automations.

## Personal accounts, private content

One Quill deployment can serve a small team without becoming a shared workspace.
Each person creates their own login, connects their own X account, and receives
their own agent key. Posts, drafts, queues, automations, analytics, and writing
history are all scoped to that person; one account cannot view another's content.
The deployment uses one shared X developer app, configured once in Settings.

## Run it

### Backend → http://localhost:8787

```bash
cd backend
cp .env.example .env          # set two random secrets (see below)
npm install && npx prisma migrate deploy
npm run dev                   # API (run `npm run worker` alongside for publishing)
```

The database is **SQLite** — a single file at `backend/data/quill.db`, created
automatically by `prisma migrate deploy`. No database server to install or run.

The only values `.env` needs are `JWT_SECRET` and `ENCRYPTION_KEY_BASE64`
(generate with `openssl rand -base64 32`). X credentials are entered later in
the UI.

### Frontend → http://localhost:4310

```bash
cd frontend
npm install && npm run dev    # NEXT_PUBLIC_API_BASE_URL defaults to :8787
```

> Frontend runs on **4310**. If you change it, set the backend's `APP_BASE_URL`
> to match (drives CORS + the post-OAuth redirect).

### First run — everything else is in the UI

1. Open http://localhost:4310 → **create your personal account**.
2. On the first account, **Settings → Shared X app** walks you through creating a free
   app at [developer.x.com](https://developer.x.com) (Read and write · Web App /
   confidential client · callback URL shown with a copy button) and pasting the
   OAuth 2.0 Client ID + Secret. Stored encrypted in your database. It is shared
   only as OAuth infrastructure; never as content access.
3. Each person uses **Settings → Connect X** to approve their own X account.
4. Each person uses **Settings → Quill MCP** to copy their own remote MCP
   configuration into Codex or Claude. Profiles live in Quill, not in a shared
   local folder. See `/docs` for the complete reference.

## Deploy to Railway

Quill runs as **two Railway services** (backend + frontend) plus a **volume**
for the SQLite database — no managed database to pay for. The worker is fused
into the backend process, so one always-on backend service publishes on
schedule. Cost lands around the **$5/mo Hobby** floor. Build/start config lives
in the repo: [`backend/railway.json`](backend/railway.json) and
[`frontend/railway.json`](frontend/railway.json) (the backend runs
`prisma migrate deploy` in its start command — it must run there, not
pre-deploy, because the pre-deploy container doesn't mount the volume).

1. **Backend service** — deploy from this repo, then in **Settings** set
   **Root Directory** `/backend` and **Config file** `/backend/railway.json`
   (the config path is *not* inferred from the root directory — set it
   explicitly, or `railway.json` is ignored). Attach a **volume** mounted at
   `/data` (right-click the service → Attach volume). Add variables:
   ```
   DATABASE_URL=file:/data/quill.db
   JWT_SECRET=<openssl rand -hex 32>
   ENCRYPTION_KEY_BASE64=<openssl rand -base64 32>
   APP_BASE_URL=https://<frontend-domain>       # fill in after step 3
   API_BASE_URL=https://<backend-domain>        # fill in after step 3
   X_CALLBACK_URL=https://<backend-domain>/api/x/callback
   ```
2. **Frontend service** — deploy from this repo again; **Settings → Root
   Directory** `/frontend`, **Config file** `/frontend/railway.json`.
3. **Generate a public domain** for each service (**Settings → Networking**),
   fill in the backend cross-URLs above, and set the frontend's URL **before it
   builds** (`NEXT_PUBLIC_*` is inlined at build time):
   ```
   NEXT_PUBLIC_API_BASE_URL=https://<backend-domain>
   ```
   Then redeploy both — the frontend must **rebuild** to bake in its API URL.
4. Follow the **First run** steps above, pointed at your deployed frontend URL
   (register the X callback `https://<backend-domain>/api/x/callback` in your X app).

**Backups**: open the volume in Railway → **Backups** tab → enable a daily
schedule (incremental snapshots; restore is one click). The database runs in
WAL mode, so snapshots are crash-consistent. For point-in-time recovery to
object storage, add [Litestream](https://litestream.io) replicating
`/data/quill.db` to any S3-compatible bucket.

> **One-click button:** a "Deploy on Railway" button needs a *template* published
> once from the Railway dashboard — a `railway.json` describes a single service
> and can't declare two services + a volume. After publishing one, add:
> `[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template/<CODE>)`

## The UI (two surfaces)

- **Queue** — Drafts the agent proposed (approve → schedule, or discard) and
  Scheduled posts the worker will publish (cancel anytime).
- **Automations** — CTA auto-plug (reply once when a post crosses a like
  threshold) and Auto-repost (recycle an evergreen post on a cadence).

Writing happens through the Quill MCP, not in a local agent folder.

## Quill MCP

The deployed MCP endpoint is `https://<backend-domain>/mcp`, authenticated with
the personal Quill key shown in Settings. It exposes private profiles, owned
post sync, paginated research, media assets, post/thread/reply drafts, native X
Article review + scheduling, queue controls, CTA automation, and repost rules.
It deliberately has no direct-publish tool: the human approves the exact draft
or private X Article review before the agent schedules it.

The full setup and tool reference are served by the frontend at `/docs`.

The worker (in the backend) is the clock: it publishes scheduled posts and runs
CTA/repost rules on time, independently of any agent session.

## Research and contextual replies

**Quill for X** is an optional Chrome side-panel companion in `extension/`. It
captures a post, thread, profile, or article into the authenticated person's
private Quill research inbox. The agent reads that context alongside the
account's private reply profile, then proposes a reply draft. The
side panel can also ask Quill's backend to prepare a batch of Gemini replies;
the Gemini key stays in Railway, never in Chrome. A capture token can access
research only: it cannot reach agent credentials, drafts, schedules, or
publishing endpoints.

Use **Settings → Quill for X** to issue a browser-companion token, load
`extension/` in Chrome, and paste the token there. The token is shown once and
can be revoked in Settings. The extension never auto-replies or auto-posts.
