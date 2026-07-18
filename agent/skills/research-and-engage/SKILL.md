---
name: research-and-engage
description: Turn a person's captured X research into honest, contextual Quill reply drafts. Use after the Quill browser companion or agent has saved opportunities.
---

# Research and engage

Use Quill's research inbox to prepare replies that are worth sending. This is
research and drafting, not autonomous outreach.

1. Read `voice/voice-profile.md` before writing anything.
2. Run `node quill.mjs research list --status NEW` (or `KEPT`) to inspect the
   person's captures. The capture belongs only to the authenticated person.
3. Mark clear mismatches as junk with `quill research update ID --status JUNK
   --reason "..."`. Mark worthwhile opportunities as kept, with a short reason
   and an importance score.
4. For each reply, address the actual parent post first. Add a useful concrete
   thought; mention Ghostfeed only when it genuinely helps. Never invent proof,
   outcomes, customer stories, or product capabilities.
5. Present the proposed text to the human. Only after they approve it, create a
   Quill reply draft with `quill research draft ID --text "..."`.
6. A draft is still not a published reply. Scheduling needs separate explicit
   human approval of the exact text and time.

Never auto-scroll, auto-reply, or publish. Captured profile posts are research;
they do not modify the person's writing profile.
