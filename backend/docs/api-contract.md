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
- `POST /composer/media`
  - uploads media to X and returns media id metadata

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

