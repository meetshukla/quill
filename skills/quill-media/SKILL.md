---
name: quill-media
description: Manage durable Quill media assets and attach owned images or videos to reviewed X drafts or native Articles. Use when a Quill post or Article needs authorized media, or when unused media needs removal.
---

# Quill Media Assets

Use the configured `quill` MCP server.

1. Call `list_media_assets` before uploading to avoid duplicates.
2. Call `upload_media_asset` only for media the human owns or is authorized to publish. Accept JPEG, PNG, WebP, GIF, MP4, and MOV bytes.
3. Pass returned IDs to `create_draft`, or to an Article cover/body as appropriate.
4. Call `delete_media_asset` only on explicit request. Quill protects assets attached to a draft, schedule, or Article.

Research-media URLs are provenance, not owned assets. For an X post use at most four still images or one GIF/video.
