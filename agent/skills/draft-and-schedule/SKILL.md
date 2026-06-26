---
name: draft-and-schedule
description: Everyday. Draft posts in the user's voice, propose them to the Quill queue for review, and schedule the ones they approve.
---

# Draft and schedule

The day-to-day loop. Fast and cheap — it reads the voice profile (no tweet sync,
no analysis) and proposes drafts the user reviews in Quill.

## Steps

1. **Load the voice.** Read `voice/voice-profile.md`. If it says "not generated
   yet", run the `bootstrap-voice` skill first — don't guess a voice.

2. **Understand the ask.** What does the user want — a topic, a count, a format
   (single posts / thread), a cadence? If vague, ask one clarifying question.

3. **Draft in their voice.** Write each post to match the profile: tone, rhythm,
   diction, formatting habits, and **avoids**. Concrete and honest. Don't add
   emoji/hashtags unless the profile shows them.

4. **Propose, don't post.** For each draft call `propose_draft`
   (`text`, or `threadParts` for a thread). Optionally include
   `suggestedScheduledAt` (ISO) + `timezone` to suggest a slot. They land in the
   Quill queue as drafts.

5. **Show the user.** List what you proposed (plainly) and that they're waiting
   for approval in Quill. Offer to schedule.

6. **Schedule on approval only.** When the user approves specific drafts, call
   `schedule_draft` with the agreed time + timezone. Never schedule on your own.
   Use `list_queue` to find ids; `discard_draft` for ones they reject.

## Good defaults

- Spread a batch across days/times rather than dumping them at once.
- One idea per post. Lead with the point; cut throat-clearing first lines.
- For threads: first part must stand alone as a hook.

## Never

- Never post or schedule without explicit approval.
- Never invent facts, numbers, or quotes. If a post needs a real detail you
  don't have, ask the user.
