# Quill agent

The operator you open in **Claude Code** or **Codex**. It writes posts in your
voice and drives the Quill backend (queue, scheduling, automations) through a
small CLI — `quill`. It proposes drafts; it never posts on its own. You approve
them in Quill.

```
agent/
├── AGENTS.md                    operating doctrine (Codex + Claude read this)
├── CLAUDE.md                    pointer to AGENTS.md
├── quill.mjs                    the CLI (zero deps; wraps the Quill API)
├── .env.example                QUILL_API_URL / QUILL_API_KEY
├── skills/
│   ├── draft-and-schedule/      everyday: draft → propose → schedule on approval
│   └── research-and-engage/     research → contextual reply proposals
└── voice/
    ├── voice-profile.md         private campaign post profile
    └── reply-profile.md         private reply profile
```

## Setup

1. **Run the backend** (`../backend`) so the API is up at `http://localhost:8787`.
2. **Point the CLI at it** — `cp .env.example .env`. Get both values from the
   Quill UI: **Settings → Your agent** shows the `QUILL_API_URL` and your
   generated `QUILL_API_KEY` with a copy button.

That's it — the CLI has **no dependencies** (Node 18+). Open this `agent/`
folder in Claude Code or Codex; they run the `quill` commands as shell commands.

## The CLI

```bash
node quill.mjs help            # all commands
node quill.mjs status          # is X connected?
node quill.mjs sync            # pull recent tweets (incremental) for voice
node quill.mjs posts --limit 800
node quill.mjs draft --text "..."                 # propose a single post
node quill.mjs draft --part "..." --part "..."    # propose a thread
node quill.mjs queue                              # drafts + scheduled
node quill.mjs schedule <id> --at 2026-07-01T13:00:00Z --tz America/Toronto
node quill.mjs cta set "If this helped, I write daily → [link]"
node quill.mjs repost --url https://x.com/you/status/123 --every 72 --next <ISO>
```

(`chmod +x quill.mjs` once and you can run `./quill.mjs …`.)

## Owned media for scheduled posts

Quill stores **your** image/video file on its durable backend volume, then
uploads a fresh X media ID only at publish time. This avoids X's expiring media
IDs breaking a post scheduled days later. Research captures and competitor media
remain reference-only and are never republished.

```bash
node quill.mjs media upload /absolute/path/to/asset.mp4
node quill.mjs draft --text "Launch clip" --media <asset-id>
node quill.mjs schedule <draft-id> --at 2026-07-22T14:00:00.000Z --tz America/Toronto
```

Supported: up to four JPEG/PNG/WebP images, or one GIF/MP4/MOV video. Files are
attached to the first post of a thread. An asset cannot be deleted while it is
attached to a draft or scheduled post.

## Use it

- **Campaign profile:** `voice/voice-profile.md` is the private writing standard
  for this account. It is not automatically regenerated from historical posts.
- **Every day:** "draft 3 posts about X and suggest times" → runs
  `skills/draft-and-schedule`: writes in your voice, proposes them to the queue.
  You approve in the Quill UI (or tell the agent to schedule them).

## Research and contextual replies

The Quill browser companion captures posts, threads, profiles, and articles
into a private research inbox. Ask the agent to use `research-and-engage`:
it reads the dedicated reply profile, ranks the captures, and proposes
contextual reply drafts. It never posts directly.

For corpus work on another machine, the research API is cursor-paginated: no
single 500-item window limits what the agent can read. Start with
`node quill.mjs research index` to see every source and article count, then
use `node quill.mjs research export --all --source handle` (or filter by
`--type`, `--after`, and `--before`) to retrieve the complete matching corpus.
All of these reads are private to the agent key's Quill account and never post
to X.

Before using browser-side reply preparation, sync the local reply profile to
Quill once: `node quill.mjs reply-profile push`. Quill then uses that exact
reply profile for prepared replies; the Gemini key remains in the backend.
