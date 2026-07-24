---
name: quill-research-replies
description: Search and capture a person's private Quill research corpus, turn exact sources into useful insights, and prepare human copy-only X replies. Use for corpus research, manual capture intake, campaign evidence, and reply-queue work.
---

# Quill Research and Replies

Use the configured `quill` MCP server. Call `get_research_index` before planning against the corpus; it includes archived captures by default. Use `includeArchived: false` only when the human asks for the active queue.

## Research

1. Use `search_research` with source/type/date filters. Full-corpus reads include archived captures by default; set `includeArchived: false` for active-only work.
2. Follow `nextCursor` until it is `null` whenever the complete matching corpus matters.
3. Use `capture_research` only for sources already obtained through an explicit action. Preserve source URLs and available media metadata; do not scrape, fabricate, or silently collect a feed.
4. Use `list_research_rules` and `save_research_rule` only when the human asks to inspect or change Manual scan keywords.

## Replies

1. Read `get_profiles` and use only the private reply profile.
2. Call `prepare_replies` only when a natural reply can mention one exact post detail.
3. Read candidates through `get_next_replies`; return copy-ready text and the original X URL.

Never post replies. Quill replies are copy-only and a generic reply should be skipped.
