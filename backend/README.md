# Quill Backend

The Quill API: composer, scheduling, CTA auto-plug, auto-repost, the writing
assistant, optional analytics, and X OAuth 2.0 with encrypted token storage.

Scopes are limited to posting and media — no DMs, no email, no broad X
search/firehose.

## Product Priorities

1. Improve post quality with assistant rewrites and idea generation.
2. Help the user stay consistent with scheduling and queueing.
3. Support safe X writes: post, quote, reply, media, CTA auto-plug, auto-repost.
4. Keep analytics optional, lightweight, and disabled by default.
5. Make X API usage visible and budgeted.

## X API Cost Model

Official X docs price Owned Reads at `$0.001/resource`.

Analytics defaults:

- `ANALYTICS_ENABLED=false`
- when enabled, only last 7 days
- hard cap at `ANALYTICS_MAX_POSTS=500`
- stop analytics refresh when daily/monthly budgets are hit

The app should still work when analytics are disabled.

## Backend-only reply generation

The Quill browser companion can prepare replies through the backend. Configure
Gemini only in the backend environment—never in Chrome:

```text
AI_PROVIDER=gemini
AI_API_KEY=<Gemini key>
AI_MODEL=gemini-3.5-flash
```

The browser sends captured X context to Quill, and Quill uses the authenticated
person's campaign writing profile to make a copyable reply proposal. It never
publishes a reply.

## Required X App Settings

Use a Web App / Automated App / Bot confidential client.

Required scopes:

```text
tweet.read users.read tweet.write media.write offline.access
```

Do not request DM or email scopes for this product.

## Local Setup

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm prisma:generate
pnpm prisma:migrate
pnpm dev
```

Worker:

```bash
pnpm worker
```

## Backend Modules

- `src/services/x-oauth.service.ts`: OAuth 2.0 URL/callback/token refresh.
- `src/services/x-client.service.ts`: all X API calls plus usage logging.
- `src/services/composer.service.ts`: immediate posts, quotes, replies, threads, media.
- `src/services/media-asset.service.ts`: durable owned-media storage and just-in-time X upload for scheduled posts.
- `src/services/schedule.service.ts`: scheduled post CRUD and due-job publishing.
- `src/services/cta.service.ts`: default CTA and like-threshold auto-plug.
- `src/services/repost.service.ts`: auto-repost rules and execution.
- `src/services/assistant.service.ts`: chat, rewrites, structured composer actions.
- `src/services/analytics.service.ts`: optional last-7-days-only analytics.
- `src/services/current-user.service.ts`: legacy-account migration bridge.
- `src/workers/index.ts`: cron-like worker loop.

## Docs

- `docs/api-contract.md`: backend endpoints and request/response shapes.
- `docs/implementation-plan.md`: implementation phases and module ownership.
- `docs/x-api-costs.md`: owned-read cost model and budget defaults.
- `docs/security.md`: token, OAuth, automation, and deployment safety notes.

## Safety Rules

- Never publish from assistant without explicit user action.
- Never retry a write without idempotency protection.
- Never sync older than the configured analytics window.
- Never run analytics when disabled.
- Never expose X tokens or AI keys to the frontend.
- Log every X write operation.
