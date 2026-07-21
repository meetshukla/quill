---
name: quill-automations
description: Configure and manage explicit Quill CTA reply automations and evergreen repost rules for an authenticated X account. Use when the human asks to inspect, create, pause, resume, edit, or remove an automation.
---

# Quill Automations

Use the configured `quill` MCP server. Read existing settings/rules before proposing a change.

- Use `get_cta_setting` and `set_cta_setting` for CTA reply text.
- Use `list_cta_automations`, `create_cta_automation`, and `delete_cta_automation` for CTA rules.
- Use `list_repost_rules`, `create_repost_rule`, `set_repost_rule_status`, and `delete_repost_rule` for evergreen repost rules.

Before a write, state the exact trigger, affected post, cadence, and CTA text. Create, modify, pause, resume, or delete a rule only on explicit request. The deployed worker runs active rules independently of the MCP client.
