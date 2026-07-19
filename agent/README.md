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
└── voice/voice-profile.md       private campaign writing profile
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

## Use it

- **Campaign profile:** `voice/voice-profile.md` is the private writing standard
  for this account. It is not automatically regenerated from historical posts.
- **Every day:** "draft 3 posts about X and suggest times" → runs
  `skills/draft-and-schedule`: writes in your voice, proposes them to the queue.
  You approve in the Quill UI (or tell the agent to schedule them).

## Research and contextual replies

The Quill browser companion captures posts, threads, profiles, and articles
into a private research inbox. Ask the agent to use `research-and-engage`:
it reads the campaign profile, ranks the captures, and proposes contextual
reply drafts. It never posts directly.

Before using browser-side reply preparation, sync the same local profile to
Quill once: `node quill.mjs profile push`. Quill then uses that exact campaign
profile for prepared replies; the Gemini key remains in the backend.
