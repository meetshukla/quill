---
name: bootstrap-voice
description: One-time. Derive the user's writing voice from their real tweets and write voice/voice-profile.md. Run when the profile is missing or stale.
---

# Bootstrap voice

Goal: turn the user's actual posting history into a fixed, reusable voice
profile that every future draft is written from. Run this **once** (re-run only
when their style has clearly drifted, or they ask).

## Steps

1. **Confirm connection.** Call `connection_status`. If no account is connected,
   stop and tell the user to connect X in Quill Settings first.

2. **Sync tweets.** Call `sync_posts` (incremental; defaults to ~800). It pulls
   their recent posts *including replies and the post each reply answered*.
   - First ever run on an empty DB returns `mode: "full"`.
   - Tell the user the rough cost if it's a large pull (~$0.001/post).

3. **Read them.** Call `get_posts` (use `limit` ~800). Each item is
   `{ text, type, inReplyTo, quotes, createdAt }`. For replies/quotes, study the
   pair: **how they respond to `inReplyTo`/`quotes`**, not just the reply alone.

4. **Analyze — strictly.** Work only from evidence in the posts. Do NOT invent
   traits or import generic "good tweet" advice. For every claim you make, it
   must be visible in multiple posts. Extract:
   - **Tone & stance** (e.g. direct, dry, warm, contrarian) — with 1–2 quotes.
   - **Rhythm & structure** — sentence length, openings, how posts end, line
     breaks, thread shape.
   - **Diction** — recurring words/phrases; reading level; contractions; casing.
   - **Formatting habits** — emoji? hashtags? links? lists? em-dashes?
     Quantify: "emoji in 0/800", "hashtags in 3/800".
   - **Originals vs replies** — how the voice differs when responding to someone.
   - **Recurring themes / topics.**
   - **Hard avoids** — patterns clearly absent (so drafts never add them).

5. **Write the profile.** Overwrite `voice/voice-profile.md` using the template
   below. Keep it tight and prescriptive — it's instructions to a writer, not an
   essay. Include 5–8 **real** reference posts (verbatim, best examples).

6. **Confirm.** Summarize the voice in 3 lines to the user and note the file was
   updated.

## Output template (`voice/voice-profile.md`)

```markdown
# Voice profile
_Generated <ISO date> from <N> posts (<M> replies)._

## Tone
<2–4 lines, each grounded in the posts>

## Rhythm & structure
- <bullets>

## Diction
- <bullets, with recurring phrases>

## Formatting
- Emoji: <freq>. Hashtags: <freq>. Links: <habit>. Em-dashes: <habit>.

## Originals vs replies
- <how voice shifts>

## Themes
- <topics>

## Avoid
- <patterns to never produce>

## Reference posts
1. "<verbatim>"
2. "<verbatim>"
...
```

## Rules

- Evidence over intuition. If you can't point to posts, don't claim it.
- Don't flatter. Capture how they *actually* write, including rough edges.
- Never post anything during bootstrap. This skill only reads + writes the file.
