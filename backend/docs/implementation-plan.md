# Backend Implementation Plan

This plan covers the backend only.

## Phase 1: Foundation

Deliverables:

- Fastify server boot.
- Prisma schema and migrations.
- Environment validation.
- Encrypted secret helper.
- Single-user/single-X-account assumptions documented.

Verification:

- `pnpm typecheck`
- `pnpm prisma:migrate`
- `GET /api/health`

## Phase 2: X OAuth And Account Connection

Deliverables:

- OAuth 2.0 authorization URL.
- Callback handler with state and PKCE verifier storage.
- Token exchange.
- `/2/users/me` profile fetch.
- Encrypted access/refresh token storage.
- Scope detection and `writeEnabled` flag.

Verification:

- Connect account locally.
- DB has exactly one `x_accounts` row.
- Tokens are encrypted, not plaintext.
- `writeEnabled` reflects `tweet.write`.

## Phase 3: X Client And Usage Accounting

Deliverables:

- Central X client wrapper.
- Rate-limit header capture.
- Usage event logging for reads/writes/media/auth.
- Owned Reads charged at `$0.001/resource`.
- Daily/monthly budget reads.

Verification:

- Every X API method writes an `x_api_usage_events` row.
- Owned read lookup with 10 returned resources estimates `$0.01`.
- Analytics sync refuses to run after hard limit.

## Phase 4: Composer Writes

Deliverables:

- Immediate text post.
- Quote post.
- Reply post.
- Thread posting.
- Media attachment flow.
- Idempotency keys for retry safety.

Verification:

- Write endpoints reject when `writeEnabled=false`.
- A failed write records an error without retry-spamming.
- Thread posting replies each part to the previous part.

## Phase 5: Scheduling

Deliverables:

- Scheduled post create/list/cancel.
- Worker publishes due posts.
- Failure and retry states.
- Timezone field preserved.

Verification:

- Due scheduled post transitions `SCHEDULED -> POSTING -> POSTED`.
- Failed publish transitions `POSTING -> FAILED`.
- Cancelled jobs do not publish.

## Phase 6: Assistant Backend

Deliverables:

- Chat storage.
- Draft rewrite endpoint.
- Structured actions:
  - `open_composer`
  - `use_in_composer`
  - optional `suggestedScheduledAt`
- Context builder that works with analytics disabled.
- Writing profile and saved examples.

Verification:

- Assistant can rewrite a draft without any X reads.
- `use_in_composer` actions are returned as structured JSON.
- Context excludes recent posts when analytics are disabled.

## Phase 7: CTA Auto-Plug

Deliverables:

- CTA setting.
- CTA automation creation.
- Worker checks like threshold for at most 7 days.
- CTA reply posts once.
- Duplicate prevention with idempotency key.

Verification:

- CTA automation expires after window.
- CTA posts exactly once when threshold is reached.
- CTA does not run without write permission.

## Phase 8: Auto-Repost

Deliverables:

- Validate pasted X URL.
- Store cadence rule.
- Worker executes due reposts.
- Pause/failure states.

Verification:

- Invalid URLs rejected.
- Due rule advances `nextRunAt`.
- Failed rule records error and stops looping.

## Phase 9: Optional Analytics

Deliverables:

- Analytics settings.
- Disabled by default.
- Last-7-days-only sync.
- Rolling expiry.
- Summary endpoint.
- No deep history.

Verification:

- With analytics off, sync returns `analytics_disabled`.
- With analytics on, sync fetches no more than `ANALYTICS_MAX_POSTS`.
- No stored post survives beyond retention unless refreshed.

## Phase 10: Deployment Readiness

Deliverables:

- README setup.
- `.env.example`.
- Docker Compose, if desired.
- License.
- Clear X API cost warning.
- Clear anti-spam usage warning.

Verification:

- Fresh checkout can boot locally.
- User can configure their own X app.
- No secrets committed.

