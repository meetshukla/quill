---
name: quill-posts
description: Create private Quill drafts for X posts, replies, quotes, threads, and media posts, then schedule only human-approved drafts. Use whenever the user asks to write, queue, reschedule, or cancel an owned X post.
---

# Quill Post Drafts

Use the configured `quill` MCP server. Start with `get_quill_status`, `get_profiles`, and the relevant research.

1. Use `create_draft` for a post, reply, quote, thread, or owned media post. It never publishes.
2. Present the exact draft text, target, media, date, time, and timezone to the human.
3. Call `schedule_draft` only after explicit approval of every one of those details.
4. Use `list_drafts`, `discard_draft`, `list_scheduled_posts`, and `cancel_scheduled_post` to manage the queue. Discard/cancel only when explicitly requested.

Do not seek a bypass: Quill has no direct-publish tool.
