# Quill — frontend

A focused workspace for writing, scheduling, and shipping better posts on X.
Pairs with the Quill API in `../backend`. Analytics are optional and **off by
default**.

## Stack

- Next.js 15 (App Router) · React 19 · TypeScript
- Tailwind CSS v4
- shadcn/ui-style components (Radix primitives + CVA) under `src/components/ui`
- lucide-react icons · sonner toasts · zustand (shared composer draft)

## Run

```bash
npm install
cp .env.example .env.local   # already present; point at the backend
npm run dev                  # http://localhost:3000  → redirects to /app
```

Set the backend base URL in `.env.local`:

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8787
```

Other scripts: `npm run build`, `npm start`, `npm run typecheck`.

## Surfaces (`/app`)

| Route             | What it does                                                        |
| ----------------- | ------------------------------------------------------------------- |
| `/app`            | Overview — connection status, queue glance, quick actions           |
| `/app/chat`       | Assistant — rewrite drafts; action cards open/fill the composer     |
| `/app/composer`   | Composer — original / quote / reply / thread, post now or schedule  |
| `/app/queue`      | Scheduled posts — status, time, timezone, cancel                    |
| `/app/cta`        | Default CTA + auto-plug automations (like-threshold, 7-day window)  |
| `/app/repost`     | Auto-repost rules — validate URL, cadence, next run, pause/delete   |
| `/app/analytics`  | Optional last-7-days summary; disabled state + Owned-Reads warning  |
| `/app/settings`   | Connect or disconnect your X account, see write permission status   |

## How it maps to the backend

The typed client lives in `src/lib/api.ts` and targets the **routes the starter
actually registers**. A few endpoints listed in the original brief aren't wired
in the starter yet — listing CTA automations, listing/patching/deleting repost
rules, and a per-post analytics table. The UI calls them and **degrades
gracefully** (a clear "not available on this backend build" state) when the API
returns 404, so it's ready the moment those routes land.

## Composer ⇄ Assistant

The composer draft is a small persisted zustand store (`src/lib/store.ts`).
Assistant action cards call `loadDraft(...)` and navigate to the composer — the
assistant only ever **suggests**; you always click publish/schedule yourself.
