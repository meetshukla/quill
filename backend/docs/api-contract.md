# Backend API Contract

Base path: `/api`

## Health

- `GET /health`

## X OAuth

- `POST /x/connect/start`
  - returns `{ url }`
- `GET /x/callback`
  - exchanges OAuth code
  - stores encrypted tokens
- `POST /x/disconnect`
  - deletes tokens and cancels workers
- `GET /x/account`
  - returns connected account summary

## Composer

- `POST /composer/post`
  - immediate post, quote, reply, or thread
- `POST /composer/schedule`
  - creates a scheduled post
- `POST /composer/quote-preview`
  - fetches/caches a pasted X URL preview

## Owned Media Assets

- `POST /media/assets`
  - accepts a raw JPEG/PNG/WebP/GIF/MP4/MOV body from an authenticated Quill
    user/agent and stores it on Quill's durable volume
- `GET /media/assets`
  - lists the current person's uploaded assets
- `DELETE /media/assets/:id`
  - deletes an unused asset

Composer and draft payloads accept `mediaAssetIds`. Quill uploads those files to
the connected X account immediately before publishing, so an expiring X media
ID cannot break a future scheduled post. `mediaIds` remains legacy-only.

## Native X Articles

- `POST /articles` stores a Quill Article draft (`title`, DraftJS
  `contentState`, optional `coverAssetId`).
- `POST /articles/:id/review` uploads referenced owned assets, creates a
  non-public X Article draft, and returns the X review URL.
- `POST /articles/:id/schedule` may only schedule that reviewed X draft.
- `GET /articles` lists Article drafts and scheduled/published state.

Article entities may use Quill-only `value.data.asset_ids`; Quill replaces them
with fresh X `media_items` while creating the review draft.

## Scheduled Posts

- `GET /scheduled-posts`
- `PATCH /scheduled-posts/:id`
- `DELETE /scheduled-posts/:id`

## CTA

- `GET /cta`
- `PUT /cta`
- `POST /cta/automations`
- `DELETE /cta/automations/:id`

## Repost

- `GET /repost-rules`
- `POST /repost-rules/validate`
- `POST /repost-rules`
- `PATCH /repost-rules/:id`
- `DELETE /repost-rules/:id`

## Assistant

- `GET /assistant/chats`
- `POST /assistant/chats`
- `GET /assistant/chats/:id`
- `POST /assistant/chats/:id/messages`
- `POST /assistant/draft-rewrite`

## Analytics

Analytics endpoints should return empty/disabled states when analytics are off.

- `GET /analytics/settings`
- `PUT /analytics/settings`
- `POST /analytics/sync`
- `GET /analytics/summary`
- `GET /analytics/posts`
- `GET /analytics/activity`
