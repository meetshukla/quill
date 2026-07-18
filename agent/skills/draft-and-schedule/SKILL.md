---
name: draft-and-schedule
description: Everyday. Draft posts in the user's voice, propose them to the Quill queue for review, and schedule the ones they approve.
---

# Draft and schedule

The day-to-day loop. Fast and cheap — it reads the voice profile (no tweet sync,
no analysis) and proposes drafts the user reviews in Quill.

## Steps

1. **Load the campaign writing profile.** Read `voice/voice-profile.md`. If it
   is missing, stop and ask for it — don't infer it from historical tweets.

2. **Understand the ask.** What does the user want — a topic, a count, a format
   (single posts / thread), a cadence? If vague, ask one clarifying question.

3. **Draft in their voice.** Write each post to match the profile: tone, rhythm,
   diction, formatting habits, and **avoids**. Concrete and honest. Don't add
   emoji/hashtags unless the profile shows them.

4. **Propose, don't post.** For each draft run `quill draft --text "…"` (or
   `--part "…" --part "…"` for a thread). Optionally add `--at ISO --tz TZ` to
   suggest a slot. They land in the Quill queue as drafts.

5. **Show the user.** List what you proposed (plainly) and that they're waiting
   for approval in Quill. Offer to schedule.

6. **Schedule on approval only.** When the user approves specific drafts, run
   `quill schedule ID --at ISO --tz TZ` with the agreed time. Never schedule on
   your own. Use `quill queue` to find ids; `quill discard ID` for rejects.

## Good defaults

- Spread a batch across days/times rather than dumping them at once.
- One idea per post. Lead with the point; cut throat-clearing first lines.
- For threads: first part must stand alone as a hook.

## Never

- Never post or schedule without explicit approval.
- Never invent facts, numbers, or quotes. If a post needs a real detail you
  don't have, ask the user.
