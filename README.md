# Quill

Quill is a focused workspace for writing, scheduling, and shipping better posts
on X: a composer, an always-on writing assistant, a scheduling queue, CTA
auto-plug, and auto-repost. Analytics are optional and **off by default**.

```
quill/
├── frontend/   Next.js 15 · React 19 · Tailwind v4 · shadcn/ui  (the daily workspace)
└── backend/    Fastify · Prisma · Postgres · X OAuth 2.0        (the API)
```

## Run it

Two processes. Postgres runs in Docker (from `backend/`).

### 1. Backend → http://localhost:8787

```bash
cd backend
cp .env.example .env          # then fill X_CLIENT_ID / X_CLIENT_SECRET
docker compose up -d          # Postgres
pnpm install
pnpm prisma:generate
pnpm prisma migrate dev
pnpm dev
```

### 2. Frontend → http://localhost:4310

```bash
cd frontend
npm install
npm run dev                   # NEXT_PUBLIC_API_BASE_URL defaults to :8787
```

Open http://localhost:4310 → it redirects to `/app`.

> Runs on **4310** to avoid colliding with other local dev servers on 3000.
> If you change the frontend port, set the backend's `APP_BASE_URL` to match
> (it drives CORS and the post-OAuth redirect).

## Connecting X

Create an app in the [X Developer Portal](https://developer.x.com) inside a
Project:

- **App permissions:** Read and write
- **Type of App:** Web App, Automated App or Bot (confidential client)
- **Callback URL:** `http://localhost:8787/api/x/callback`
- **Website URL:** `http://localhost:3000`
- **Scopes used:** `tweet.read users.read tweet.write media.write offline.access`

Copy the OAuth 2.0 **Client ID** and **Client Secret** into `backend/.env`, then
click **Connect X** in Settings.

## What's inside

- **Overview** — connection, queue glance, quick actions
- **Composer** — original / quote / reply / thread · post now or schedule
- **Assistant** — persistent right-hand panel; rewrites drafts, opens them in the composer
- **Queue** — scheduled posts with status, time, timezone
- **CTA** — default CTA + like-threshold auto-plug
- **Repost** — evergreen auto-repost rules
- **Analytics** — optional last-7-days summary (paid Owned Reads; off by default)
- **Settings** — X connection, budget guardrails, appearance

Keyboard: **⌘K** command palette · **⌘J** toggle the assistant.

> The frontend targets the routes the backend actually registers and degrades
> gracefully (clear "not available on this build" states) for endpoints the
> starter hasn't wired yet.
