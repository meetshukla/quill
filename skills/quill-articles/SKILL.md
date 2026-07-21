---
name: quill-articles
description: Create a private native X Article in Quill, materialize it as a private X review draft, and schedule only the exact reviewed Article. Use for all long-form X Article drafting, revision, review, and scheduling tasks.
---

# Quill Native Articles

Use the configured `quill` MCP server. Start with `get_profiles` and relevant research.

1. Use `create_article_draft` with a title and X DraftJS `contentState`. Use owned Quill asset IDs for the cover and body media.
2. Call `create_article_review` to create a private native X Article and receive `reviewUrl`.
3. Require the human to open and inspect that real X URL.
4. Call `schedule_article` only after explicit approval of that exact review URL, date, time, and timezone.

Use `list_articles` to inspect existing records. If the Article changes after review, create a fresh review. Never schedule an unreviewed Article.
