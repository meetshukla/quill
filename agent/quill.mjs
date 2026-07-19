#!/usr/bin/env node
/**
 * quill — a tiny CLI wrapper over the Quill backend API.
 *
 * The agent (Claude / Codex) runs these as shell commands; output is JSON so it
 * can be parsed. Zero dependencies (Node 18+ fetch). It proposes drafts — it
 * never posts directly; the user approves in Quill or via `quill schedule`.
 *
 * Config (env, or an agent/.env file):
 *   QUILL_API_URL   default http://localhost:8787
 *   QUILL_API_KEY   Personal bearer key from Quill Settings
 *
 * Usage:
 *   quill status
 *   quill sync [--max 800] [--full]
 *   quill posts [--limit 800]
 *   quill draft --text "..." [--reply-to ID] [--quote ID] [--at ISO] [--tz TZ]
 *   quill draft --part "tweet 1" --part "tweet 2" ...        (a thread)
 *   quill queue
 *   quill schedule ID --at ISO --tz TZ
 *   quill discard ID
 *   quill cancel ID
 *   quill cta set "default cta text"
 *   quill cta auto --post ID --text "cta" --likes 50
 *   quill repost --url URL --every 72 --next ISO
 *   quill research list [--status NEW] [--type POST] [--limit 100]
 *   quill research update ID --status KEPT --importance 80 --reason "..."
 *   quill research rules
 *   quill research draft ID --text "..."
 *   quill research prepare [--limit 5]
 *   quill profile push
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// --- config (env + optional agent/.env) ---------------------------------
function loadDotenv() {
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const text = readFileSync(join(dir, ".env"), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* no .env — fine */
  }
}
loadDotenv();

const API = (process.env.QUILL_API_URL ?? "http://localhost:8787").replace(/\/$/, "");
const KEY = process.env.QUILL_API_KEY ?? "";

// --- arg parsing ---------------------------------------------------------
function parseArgs(argv) {
  const positionals = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith("--")) {
      const key = tok.slice(2);
      const next = argv[i + 1];
      const value = next === undefined || next.startsWith("--") ? true : (i++, next);
      if (key in flags) {
        flags[key] = Array.isArray(flags[key]) ? [...flags[key], value] : [flags[key], value];
      } else {
        flags[key] = value;
      }
    } else {
      positionals.push(tok);
    }
  }
  return { positionals, flags };
}
const asArray = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

// --- API call ------------------------------------------------------------
async function call(path, init = {}) {
  let res;
  try {
    res = await fetch(`${API}/api${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(KEY ? { authorization: `Bearer ${KEY}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    fail(`Can't reach Quill at ${API}. Is the backend running?`);
  }
  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    const msg = body && typeof body === "object" && "error" in body ? body.error : text;
    fail(`API ${res.status}: ${msg}`);
  }
  return body;
}

function done(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  process.exit(0);
}
function fail(msg) {
  process.stderr.write(`quill: ${msg}\n`);
  process.exit(1);
}

const HELP = `quill — drive the Quill backend from the terminal

  status                          is an X account connected?
  sync [--max N] [--full]         pull recent tweets (incremental) for voice
  posts [--limit N]               read stored tweets (with reply parents)
  draft --text "..." [--reply-to ID] [--quote ID] [--at ISO] [--tz TZ]
  draft --part "..." --part "..." (a thread; repeat --part)
  queue                           drafts awaiting approval + scheduled posts
  schedule ID --at ISO --tz TZ    approve a draft → schedule it
  discard ID                      delete a draft
  cancel ID                       cancel a scheduled post
  cta set "text"                  set the default CTA
  cta auto --post ID --text "cta" --likes N
  repost --url URL --every HOURS --next ISO
  research list [--status NEW] [--type POST] [--limit 100]
                                 read captured X research
  research update ID --status KEPT|JUNK|USED|ARCHIVED
                  [--importance 0-100] [--reason "..."]
  research rules                   read match, exclude, and priority rules
  research draft ID --text "..."  create a reply proposal for one capture
  research prepare [--limit 5]    prepare Gemini replies through Quill
  profile push                    sync local campaign profile to Quill
`;

// --- commands ------------------------------------------------------------
const [, , cmd, ...rest] = process.argv;
const { positionals, flags } = parseArgs(rest);

switch (cmd) {
  case "status":
    done(await call("/x/account"));
    break;

  case "sync": {
    const body = {};
    if (flags.max) body.max = Number(flags.max);
    if (flags.full) body.full = true;
    done(await call("/posts/sync", { method: "POST", body: JSON.stringify(body) }));
    break;
  }

  case "posts":
    done(await call(`/posts${flags.limit ? `?limit=${Number(flags.limit)}` : ""}`));
    break;

  case "draft": {
    const parts = asArray(flags.part);
    const payload = {
      text: typeof flags.text === "string" ? flags.text : undefined,
      threadParts: parts.length ? parts : undefined,
      quotePostId: typeof flags.quote === "string" ? flags.quote : undefined,
      replyToPostId: typeof flags["reply-to"] === "string" ? flags["reply-to"] : undefined,
      scheduledAt: typeof flags.at === "string" ? flags.at : undefined,
      timezone: typeof flags.tz === "string" ? flags.tz : undefined,
    };
    if (!payload.text && !payload.threadParts) fail("draft needs --text or --part");
    done(await call("/drafts", { method: "POST", body: JSON.stringify(payload) }));
    break;
  }

  case "queue": {
    const [drafts, scheduled] = await Promise.all([call("/drafts"), call("/scheduled-posts")]);
    done({ drafts: drafts.drafts, scheduled: scheduled.scheduledPosts });
    break;
  }

  case "schedule": {
    const id = positionals[0];
    if (!id || !flags.at || !flags.tz) fail("usage: quill schedule ID --at ISO --tz TZ");
    done(
      await call(`/drafts/${id}/schedule`, {
        method: "POST",
        body: JSON.stringify({ scheduledAt: flags.at, timezone: flags.tz }),
      }),
    );
    break;
  }

  case "discard": {
    const id = positionals[0];
    if (!id) fail("usage: quill discard ID");
    done(await call(`/drafts/${id}`, { method: "DELETE" }));
    break;
  }

  case "cancel": {
    const id = positionals[0];
    if (!id) fail("usage: quill cancel ID");
    done(await call(`/scheduled-posts/${id}`, { method: "DELETE" }));
    break;
  }

  case "cta": {
    const sub = positionals[0];
    if (sub === "set") {
      const text = positionals[1];
      if (text === undefined) fail('usage: quill cta set "text"');
      done(await call("/cta", { method: "PUT", body: JSON.stringify({ text }) }));
    } else if (sub === "auto") {
      if (!flags.post || !flags.text || !flags.likes)
        fail("usage: quill cta auto --post ID --text \"cta\" --likes N");
      done(
        await call("/cta/automations", {
          method: "POST",
          body: JSON.stringify({
            sourceXPostId: flags.post,
            ctaText: flags.text,
            likeThreshold: Number(flags.likes),
          }),
        }),
      );
    } else {
      fail("usage: quill cta set \"text\" | quill cta auto --post ID --text \"cta\" --likes N");
    }
    break;
  }

  case "repost":
    if (!flags.url || !flags.every || !flags.next)
      fail("usage: quill repost --url URL --every HOURS --next ISO");
    done(
      await call("/repost-rules", {
        method: "POST",
        body: JSON.stringify({
          sourceUrl: flags.url,
          cadenceHours: Number(flags.every),
          nextRunAt: flags.next,
        }),
      }),
    );
    break;

  case "research": {
    const sub = positionals[0];
    if (sub === "list") {
      const query = new URLSearchParams();
      if (typeof flags.status === "string") query.set("status", flags.status.toUpperCase());
      if (typeof flags.type === "string") query.set("type", flags.type.toUpperCase());
      if (flags.limit) query.set("limit", String(Number(flags.limit)));
      done(await call(`/research/items${query.size ? `?${query}` : ""}`));
    } else if (sub === "update") {
      const id = positionals[1];
      if (!id) fail("usage: quill research update ID --status KEPT|JUNK|USED|ARCHIVED [--importance N] [--reason ...]");
      const payload = {};
      if (typeof flags.status === "string") payload.status = flags.status.toUpperCase();
      if (flags.importance !== undefined) payload.importance = Number(flags.importance);
      if (typeof flags.reason === "string") payload.reason = flags.reason;
      if (!Object.keys(payload).length) fail("research update needs at least one field");
      done(await call(`/research/items/${id}`, { method: "PATCH", body: JSON.stringify(payload) }));
    } else if (sub === "rules") {
      done(await call("/research/rules"));
    } else if (sub === "draft") {
      const id = positionals[1];
      if (!id || typeof flags.text !== "string") fail('usage: quill research draft ID --text "..."');
      done(await call(`/research/items/${id}/draft`, { method: "POST", body: JSON.stringify({ text: flags.text }) }));
    } else if (sub === "prepare") {
      done(await call("/research/prepare", { method: "POST", body: JSON.stringify({ limit: flags.limit ? Number(flags.limit) : 5 }) }));
    } else {
      fail("usage: quill research list|update|rules|draft");
    }
    break;
  }

  case "profile": {
    const sub = positionals[0];
    if (sub !== "push") fail("usage: quill profile push");
    let profile;
    try {
      const dir = dirname(fileURLToPath(import.meta.url));
      profile = readFileSync(join(dir, "voice", "voice-profile.md"), "utf8").trim();
    } catch {
      fail("campaign profile missing: agent/voice/voice-profile.md");
    }
    if (profile.length < 40) fail("campaign profile is too short to sync");
    done(await call("/setup/writing-profile", { method: "PUT", body: JSON.stringify({ profile }) }));
    break;
  }

  case "help":
  case undefined:
    process.stdout.write(HELP);
    process.exit(0);
    break;

  default:
    fail(`unknown command "${cmd}". Run \`quill help\`.`);
}
