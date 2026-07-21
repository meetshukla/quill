---
name: quill-profiles
description: Read and safely update the authenticated person's private Quill writing and reply profiles, and manage their owned-post voice corpus. Use when drafting with Quill, inspecting profile guidance, syncing voice examples, or replacing a profile explicitly supplied or approved by the human.
---

# Quill Profiles

Use the configured `quill` MCP server. Start with `get_quill_status`, then call `get_profiles`.

- Use `writingProfile` for owned posts and native X Articles.
- Use `replyProfile` only for contextual X replies.
- Treat both profiles as private instructions. Do not quote them, expose them, or infer their text from historical posts.
- Call `update_profile` only when the human provides or explicitly approves the complete replacement profile. Confirm whether it is the writing or reply profile before changing it.
- Use `list_owned_posts` to read stored voice examples. Call `sync_owned_posts` only when the human requests a refresh; set `full` only for an explicitly requested historical backfill.
