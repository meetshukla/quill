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
 *   quill draft --text "..." [--media ASSET_ID] [--reply-to ID] [--quote ID] [--at ISO] [--tz TZ]
 *   quill draft --part "tweet 1" --part "tweet 2" ...        (a thread)
 *   quill media upload FILE
 *   quill queue
 *   quill schedule ID --at ISO --tz TZ
 *   quill discard ID
 *   quill cancel ID
 *   quill cta set "default cta text"
 *   quill cta auto --post ID --text "cta" --likes 50
 *   quill repost --url URL --every 72 --next ISO
 *   quill research list [--status NEW] [--type POST] [--source HANDLE] [--after ISO] [--before ISO] [--cursor CURSOR] [--limit 100]
 *   quill research export [--all] [--source HANDLE] [--type ARTICLE] [--after ISO] [--before ISO] [--limit 200]
 *   quill research index [--source HANDLE] [--type ARTICLE] [--after ISO] [--before ISO]
 *   quill research media-backfill
 *   quill research update ID --status KEPT --importance 80 --reason "..."
 *   quill research rules
 *   quill research draft ID --text "..."
 *   quill research prepare [--limit 5]
 *   quill profile push
 *   quill reply-profile push
 */
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, extname, join } from "node:path";

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

function mediaContentType(path) {
  const extension = extname(path).toLowerCase();
  return {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime"
  }[extension];
}

const HELP = `quill — drive the Quill backend from the terminal

  status                          is an X account connected?
  sync [--max N] [--full]         pull recent tweets (incremental) for voice
  posts [--limit N]               read stored tweets (with reply parents)
  draft --text "..." [--reply-to ID] [--quote ID] [--media ASSET_ID] [--at ISO] [--tz TZ]
  draft --part "..." --part "..." (a thread; repeat --part; media goes on part 1)
  media upload FILE                 store an owned image/video in Quill for scheduling
  media list                         list reusable uploaded assets
  media delete ASSET_ID              permanently remove an unused asset
  queue                           drafts awaiting approval + scheduled posts
  schedule ID --at ISO --tz TZ    approve a draft → schedule it
  discard ID                      delete a draft
  cancel ID                       cancel a scheduled post
  cta set "text"                  set the default CTA
  cta auto --post ID --text "cta" --likes N
  repost --url URL --every HOURS --next ISO
  research list [--status NEW] [--type POST] [--source HANDLE] [--after ISO]
                [--before ISO] [--cursor CURSOR] [--limit 100]
                                 read one cursor-paginated research page
  research export [--all] [--source HANDLE] [--type ARTICLE] [--after ISO]
                  [--before ISO] [--cursor CURSOR] [--limit 200]
                                 read corpus pages; --all follows every cursor
  research index [--source HANDLE] [--type ARTICLE] [--after ISO] [--before ISO]
                                 source/type counts and character totals
  research media-backfill          repair existing X video metadata; never downloads media
  research update ID --status KEPT|JUNK|USED|ARCHIVED
                  [--importance 0-100] [--reason "..."]
  research rules                   read match, exclude, and priority rules
  research draft ID --text "..."  create a reply proposal for one capture
  research prepare [--limit 5]    prepare Gemini replies through Quill
  profile push                    sync local campaign profile to Quill
  reply-profile push              sync local reply profile to Quill
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
    const mediaAssetIds = asArray(flags.media).filter((value) => typeof value === "string");
    const payload = {
      text: typeof flags.text === "string" ? flags.text : undefined,
      threadParts: parts.length ? parts : undefined,
      quotePostId: typeof flags.quote === "string" ? flags.quote : undefined,
      replyToPostId: typeof flags["reply-to"] === "string" ? flags["reply-to"] : undefined,
      mediaAssetIds: mediaAssetIds.length ? mediaAssetIds : undefined,
      scheduledAt: typeof flags.at === "string" ? flags.at : undefined,
      timezone: typeof flags.tz === "string" ? flags.tz : undefined,
    };
    if (!payload.text && !payload.threadParts && !payload.mediaAssetIds) fail("draft needs --text, --part, or --media");
    done(await call("/drafts", { method: "POST", body: JSON.stringify(payload) }));
    break;
  }

  case "media": {
    const sub = positionals[0];
    if (sub === "list") {
      done(await call("/media/assets"));
    } else if (sub === "delete") {
      const id = positionals[1];
      if (!id) fail("usage: quill media delete ASSET_ID");
      done(await call(`/media/assets/${id}`, { method: "DELETE" }));
    } else if (sub === "upload") {
      const path = positionals[1];
      if (!path) fail("usage: quill media upload FILE");
      let data;
      try {
        if (!statSync(path).isFile()) fail("media upload needs a file");
        data = readFileSync(path);
      } catch {
        fail(`cannot read media file: ${path}`);
      }
      const contentType = mediaContentType(path);
      if (!contentType) fail("supported files: JPEG, PNG, WebP, GIF, MP4, MOV");
      done(await call("/media/assets", {
        method: "POST",
        headers: { "content-type": contentType, "x-quill-filename": basename(path) },
        body: data
      }));
    } else {
      fail("usage: quill media upload FILE | list | delete ASSET_ID");
    }
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
    const researchQuery = () => {
      const query = new URLSearchParams();
      if (typeof flags.status === "string") query.set("status", flags.status.toUpperCase());
      if (typeof flags.type === "string") query.set("type", flags.type.toUpperCase());
      if (typeof flags.source === "string") query.set("sourceHandle", flags.source.replace(/^@/, ""));
      if (typeof flags.after === "string") query.set("capturedAfter", flags.after);
      if (typeof flags.before === "string") query.set("capturedBefore", flags.before);
      if (typeof flags.cursor === "string") query.set("cursor", flags.cursor);
      if (flags.limit) query.set("limit", String(Number(flags.limit)));
      return query;
    };
    if (sub === "list") {
      const query = researchQuery();
      done(await call(`/research/items${query.size ? `?${query}` : ""}`));
    } else if (sub === "export") {
      const query = researchQuery();
      const path = (value) => `/research/export${value.size ? `?${value}` : ""}`;
      if (!flags.all) {
        done(await call(path(query)));
      }
      const items = [];
      let pageCount = 0;
      let total = 0;
      while (true) {
        const page = await call(path(query));
        items.push(...page.items);
        total = page.total;
        pageCount += 1;
        if (!page.nextCursor) break;
        query.set("cursor", page.nextCursor);
      }
      done({ items, total, pageCount, nextCursor: null });
    } else if (sub === "index") {
      const query = researchQuery();
      query.delete("cursor");
      query.delete("limit");
      done(await call(`/research/index${query.size ? `?${query}` : ""}`));
    } else if (sub === "media-backfill") {
      done(await call("/research/media/backfill", { method: "POST", body: "{}" }));
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

  case "reply-profile": {
    const sub = positionals[0];
    if (sub !== "push") fail("usage: quill reply-profile push");
    let profile;
    try {
      const dir = dirname(fileURLToPath(import.meta.url));
      profile = readFileSync(join(dir, "voice", "reply-profile.md"), "utf8").trim();
    } catch {
      fail("reply profile missing: agent/voice/reply-profile.md");
    }
    if (profile.length < 40) fail("reply profile is too short to sync");
    done(await call("/setup/reply-profile", { method: "PUT", body: JSON.stringify({ profile }) }));
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
