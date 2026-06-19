# X API Cost and Usage Plan

This backend is designed around one connected X account and a small, visible X API bill.

## Known Pricing Assumption

X docs list Owned Reads at `$0.001/resource`. A "resource" is a returned owned object, so a request returning 37 owned posts is modeled as 37 billable owned-read resources.

This starter records both:

- request metadata: endpoint, method, status, rate-limit headers
- billable estimate: returned resources, owned resources charged, estimated USD

## Required Product Behavior

- Analytics are disabled by default.
- When enabled, analytics only sync the last 7 days.
- The app must remain useful without analytics.
- Composer, scheduling, assistant rewrites, CTA helpers, and repost helpers should not require analytics to be enabled.
- Only owned-account reads, writes, and media are used — no broad search or firehose.

## Default Guardrails

```text
ANALYTICS_ENABLED=false
ANALYTICS_WINDOW_DAYS=7
ANALYTICS_MAX_POSTS=500
MONTHLY_OWNED_READ_BUDGET=10000
DAILY_OWNED_READ_SOFT_LIMIT=300
DAILY_OWNED_READ_HARD_LIMIT=500
```

At `$0.001/resource`, the default monthly owned-read budget maps to roughly `$10/month`.

## Analytics Sync Strategy

1. Check the connected account and user settings.
2. Exit immediately if analytics are disabled.
3. Exit if the analytics window is greater than 7 days.
4. Estimate remaining daily and monthly owned-read budget.
5. Fetch recent owned posts with pagination up to `ANALYTICS_MAX_POSTS`.
6. Store only the last-7-days rows and expire older local analytics rows.
7. Refresh newer posts more often than older posts.

## Usage Events

`XApiUsageEvent` stores the audit trail for:

- `OWNED_READ`: owned profile/posts/lookup calls
- `EXTERNAL_READ`: quote/repost validation reads that are not owned analytics reads
- `WRITE`: create post, reply, quote, repost, media attach
- `AUTH`: OAuth and token refresh events
- `MEDIA`: media upload events when implemented

## Recommended Settings

Start with analytics off. Enable it only after posting/scheduling flows are working and your X developer account has a confirmed spend cap. Use a daily hard limit that would not surprise you if a worker loop has a bug.
