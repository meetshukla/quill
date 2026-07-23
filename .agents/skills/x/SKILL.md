---
name: X
description: Use when building applications that access X's public conversation data, including posts, users, trends, spaces, direct messages, and lists. Reach for this skill when agents need to search posts, retrieve user data, stream real-time content, manage user interactions, or analyze engagement metrics through REST endpoints with pay-per-usage pricing.
metadata:
    mintlify-proj: x
    version: "1.0"
---

# X API Skill

## Product summary

The X API provides programmatic access to X's public conversation through modern REST endpoints. Agents use it to search posts, retrieve user profiles, stream real-time content, manage lists and bookmarks, send direct messages, and access engagement metrics. The API uses pay-per-usage pricing with no subscriptions. Key endpoints are at `https://api.x.com/2/`. Authentication uses Bearer tokens (app-only) or OAuth 1.0a/2.0 (user context). Official SDKs exist for Python (`xdk`) and TypeScript (`@xdevplatform/xdk`). See the [X API documentation](https://docs.x.com/x-api/introduction) for comprehensive reference.

## When to use

Reach for this skill when:

- **Searching posts**: Find posts by keyword, user, date, or advanced operators (recent 7 days or full archive)
- **Retrieving user data**: Look up user profiles by ID or username, get follower/following lists
- **Streaming real-time posts**: Monitor posts matching filter rules with near real-time delivery
- **Managing user interactions**: Create/delete posts, like, repost, bookmark, follow/unfollow users
- **Accessing metrics**: Get engagement data (likes, reposts, replies, impressions) for posts
- **Working with lists**: Create, update, delete curated lists; manage list members
- **Direct messaging**: Send and receive private messages between users
- **Analyzing trends**: Retrieve trending topics by location or personalized trends
- **Handling compliance**: Check post/user deletion status, stream compliance events

Do not use this skill for: Ads API (separate skill), website embeds (X for Websites), authentication setup (use fundamentals docs), or account management (use Developer Console).

## Quick reference

### Authentication methods

| Method | Use case | Header format |
|:-------|:---------|:--------------|
| Bearer Token (app-only) | Public data, no user context | `Authorization: Bearer YOUR_TOKEN` |
| OAuth 1.0a | User-context actions (post, like, follow) | Signature-based; SDKs handle it |
| OAuth 2.0 | User-context with PKCE flow | Bearer token from 3-legged flow |

### Essential endpoints

| Endpoint | Method | Purpose |
|:---------|:-------|:---------|
| `/2/tweets/search/recent` | GET | Search posts from last 7 days |
| `/2/tweets/search/all` | GET | Search full archive (back to 2006) |
| `/2/tweets/search/stream` | GET | Stream posts matching rules (persistent connection) |
| `/2/tweets/search/stream/rules` | GET/POST | Manage stream filter rules |
| `/2/tweets/:id` | GET | Look up single post by ID |
| `/2/tweets` | GET | Look up multiple posts by IDs |
| `/2/users/by/username/:username` | GET | Get user by username |
| `/2/users/:id` | GET | Get user by ID |
| `/2/users/:id/tweets` | GET | Get user's posts |
| `/2/users/:id/followers` | GET | Get user's followers |
| `/2/tweets` | POST | Create a post |
| `/2/tweets/:id` | DELETE | Delete a post |
| `/2/users/:id/likes` | POST | Like a post |
| `/2/users/:id/following` | POST | Follow a user |

### Field and expansion parameters

All GET endpoints return minimal data by default. Use parameters to request additional data:

```bash
# Request additional post fields
?tweet.fields=created_at,public_metrics,author_id

# Request additional user fields
?user.fields=description,public_metrics,verified

# Include related objects (author, media, etc.)
?expansions=author_id,attachments.media_keys

# Combine with field parameters for related objects
?expansions=author_id&user.fields=username,description
```

Common field combinations:
- **Post analytics**: `tweet.fields=created_at,public_metrics,possibly_sensitive`
- **User profiles**: `user.fields=created_at,description,location,public_metrics,verified`
- **Full context**: `tweet.fields=created_at,author_id,conversation_id&expansions=author_id&user.fields=username`

### Rate limits

Check response headers for limit status:

```
x-rate-limit-limit: 900
x-rate-limit-remaining: 847
x-rate-limit-reset: 1705420800
```

Sample per-endpoint limits (15-minute windows):
- User lookup: 300/app, 900/user
- Recent search: 450/app, 300/user
- Post lookup: 450/app, 900/user
- Create post: 10,000/24hrs (app), 100/15min (user)
- Filtered stream: 50/15min connections, 1000 rules max

See [rate limits reference](/x-api/fundamentals/rate-limits) for complete table.

### Response format

Successful responses (200, 201):

```json
{
  "data": {
    "id": "123",
    "text": "Hello world",
    "created_at": "2024-01-15T12:00:00.000Z"
  },
  "includes": {
    "users": [{"id": "456", "username": "example"}]
  }
}
```

Error responses (4xx, 5xx):

```json
{
  "title": "Invalid Request",
  "detail": "The 'query' parameter is required.",
  "type": "https://api.x.com/2/problems/invalid-request"
}
```

## Decision guidance

### When to use search vs. stream

| Scenario | Use search | Use stream |
|:---------|:-----------|:-----------|
| Historical data (past 7 days or archive) | ✓ | — |
| Real-time monitoring of new posts | — | ✓ |
| One-time lookup | ✓ | — |
| Continuous listening for keywords | — | ✓ |
| Complex queries with operators | ✓ | ✓ |
| Need to paginate results | ✓ | — |

### When to use fields vs. expansions

| Need | Use fields | Use expansions |
|:-----|:-----------|:---------------|
| Get more data on primary object (post, user) | ✓ | — |
| Include related objects (author, media) | — | ✓ |
| Get fields on related objects | — | ✓ (then add fields) |
| Reduce response size | ✓ (request only needed fields) | — |

### Bearer token vs. OAuth

| Requirement | Bearer token | OAuth 1.0a | OAuth 2.0 |
|:------------|:-------------|:-----------|:----------|
| Public data only | ✓ | — | — |
| User-context actions | — | ✓ | ✓ |
| Simpler setup | ✓ | — | — |
| Better security for apps | — | ✓ | ✓ |
| PKCE flow (mobile/SPA) | — | — | ✓ |

## Workflow

### 1. Make a basic request

1. **Get credentials**: Copy Bearer Token from [Developer Console](https://console.x.com)
2. **Choose endpoint**: Start with user lookup or post lookup
3. **Build request**: Use cURL, SDK, or HTTP client
4. **Check response**: Verify status code is 2xx, parse `data` field

```bash
curl "https://api.x.com/2/users/by/username/xdevelopers" \
  -H "Authorization: Bearer $BEARER_TOKEN"
```

### 2. Request additional data

1. **Identify what you need**: Post metrics? User description? Author details?
2. **Add field parameters**: `?tweet.fields=created_at,public_metrics`
3. **Add expansions if needed**: `?expansions=author_id&user.fields=username`
4. **Test request**: Verify response includes desired fields

### 3. Search posts

1. **Build query**: Use operators (from:, has:, lang:, etc.) or keywords
2. **Choose endpoint**: `/search/recent` (7 days) or `/search/all` (full archive)
3. **Add pagination**: Use `max_results` and `next_token` for large result sets
4. **Handle rate limits**: Check headers, implement backoff if needed

```bash
curl "https://api.x.com/2/tweets/search/recent?query=from:xdevelopers&max_results=10" \
  -H "Authorization: Bearer $BEARER_TOKEN"
```

### 4. Stream real-time posts

1. **Create rules**: POST to `/2/tweets/search/stream/rules` with filter operators
2. **Verify rules**: GET `/2/tweets/search/stream/rules` to confirm
3. **Connect stream**: GET `/2/tweets/search/stream` (persistent connection)
4. **Handle disconnections**: Implement reconnect with exponential backoff
5. **Process posts**: Parse JSON objects as they arrive

### 5. Manage user interactions (requires OAuth)

1. **Get user access tokens**: Use 3-legged OAuth flow
2. **Authenticate request**: Include OAuth signature or user Bearer token
3. **Make action request**: POST to like, follow, post, etc.
4. **Check response**: Verify action succeeded (200/201)

## Common gotchas

- **Default fields are minimal**: Posts return only `id`, `text`, `edit_history_tweet_ids`. Always add `tweet.fields` for created_at, metrics, etc.
- **Expansions without fields**: Using `expansions=author_id` includes the author object, but you still need `user.fields=username` to get author details beyond ID.
- **Rate limit windows vary**: Most are 15 minutes, but some are 24 hours (e.g., post creation). Check the [rate limits table](/x-api/fundamentals/rate-limits).
- **Stream rules are additive**: Adding a rule doesn't replace existing ones. Delete old rules before adding new ones if you want to change filters.
- **Protected accounts**: Posts from protected accounts only visible with user-context auth. Public endpoints return 403 for protected content.
- **Deleted posts return 404**: Don't assume a post exists; handle 404 gracefully.
- **Search query length limits**: Recent search max 512 chars, full-archive max 1024 chars.
- **Bearer token doesn't work for user actions**: Can't like, post, or follow with app-only Bearer token. Need OAuth.
- **Pagination tokens expire**: Don't store `next_token` for later use; fetch fresh results.
- **429 errors need backoff**: Don't retry immediately. Check `x-rate-limit-reset` header and wait.
- **Streaming connection limits**: Only 1 active connection per app. Reconnecting closes the previous one.

## Verification checklist

Before submitting work with X API:

- [ ] **Authentication**: Correct Bearer token or OAuth credentials in Authorization header
- [ ] **Endpoint URL**: Correct base URL (`https://api.x.com/2/`) and path
- [ ] **HTTP method**: GET for reads, POST for creates, DELETE for deletes, PUT for updates
- [ ] **Required parameters**: All required params present (e.g., `query` for search)
- [ ] **Field parameters**: Added `tweet.fields`, `user.fields`, etc. if requesting additional data
- [ ] **Expansions**: Used if including related objects (author, media, etc.)
- [ ] **Response parsing**: Checking status code before accessing `data` field
- [ ] **Error handling**: Handling 401 (auth), 403 (access), 404 (not found), 429 (rate limit)
- [ ] **Rate limits**: Monitoring `x-rate-limit-remaining` header, implementing backoff for 429
- [ ] **Pagination**: Using `next_token` for large result sets, not storing tokens long-term
- [ ] **Stream rules**: Verified rules exist before connecting to stream (409 error if none)
- [ ] **Test with SDK**: If using official SDK, verified it handles pagination and errors automatically

## Resources

- **[X API llms.txt](https://docs.x.com/llms.txt)** — Comprehensive page-by-page navigation for all X API documentation
- **[X API Introduction](https://docs.x.com/x-api/introduction)** — Overview of products, features, and pricing
- **[Make Your First Request](https://docs.x.com/make-your-first-request)** — Step-by-step guide to authentication and basic requests
- **[Rate Limits Reference](https://docs.x.com/x-api/fundamentals/rate-limits)** — Complete per-endpoint rate limit table
- **[Response Codes & Errors](https://docs.x.com/x-api/fundamentals/response-codes-and-errors)** — HTTP status codes and error handling
- **[Fields & Expansions](https://docs.x.com/x-api/fundamentals/fields)** — How to request additional data
- **[Filtered Stream Operators](https://docs.x.com/x-api/posts/filtered-stream/integrate/operators)** — Complete list of stream filter operators
- **[Python SDK](https://docs.x.com/xdks/python/overview)** — Official Python library with async support
- **[TypeScript SDK](https://docs.x.com/xdks/typescript/overview)** — Official TypeScript/JavaScript library

---

> For additional documentation and navigation, see: https://docs.x.com/llms.txt