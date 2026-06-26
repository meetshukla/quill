#!/usr/bin/env node
/**
 * Quill MCP server — exposes the Quill backend API as agent tools so Claude /
 * Codex can read the owner's posts, propose drafts, manage the queue, and set
 * up automations. It never posts directly; drafts wait for the user's approval.
 *
 * Config: QUILL_API_URL (default http://localhost:8787), QUILL_API_KEY (Bearer,
 * required once the backend sets API_KEY).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API = (process.env.QUILL_API_URL ?? "http://localhost:8787").replace(/\/$/, "");
const KEY = process.env.QUILL_API_KEY ?? "";

async function call(path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${API}/api${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(KEY ? { authorization: `Bearer ${KEY}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    const msg = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(`Quill API ${res.status} on ${path}: ${msg}`);
  }
  return body;
}

type ToolResult = { content: { type: "text"; text: string }[] };
const ok = (data: unknown): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
});

const server = new McpServer({ name: "quill", version: "0.1.0" });

server.tool(
  "connection_status",
  "Check whether an X account is connected to Quill and can post.",
  {},
  async () => ok(await call("/x/account")),
);

server.tool(
  "sync_posts",
  "Pull the owner's recent X posts (including replies and the post each reply answered) into Quill, for voice analysis. Incremental by default — only fetches tweets newer than the last sync, so repeat calls are cheap. Set full:true for a one-time backfill.",
  {
    max: z.number().int().min(1).max(3200).optional().describe("cap on posts to pull (default 800)"),
    full: z.boolean().optional().describe("ignore the incremental cursor and backfill"),
  },
  async (args) => ok(await call("/posts/sync", { method: "POST", body: JSON.stringify(args) })),
);

server.tool(
  "get_posts",
  "Read the owner's stored posts, shaped for voice analysis: each item has the post text, type, and the text it replied to or quoted (so you see voice in context).",
  { limit: z.number().int().min(1).max(3200).optional() },
  async ({ limit }) => ok(await call(`/posts${limit ? `?limit=${limit}` : ""}`)),
);

server.tool(
  "propose_draft",
  "Propose a draft post for the user to review in the Quill queue. NEVER posts — the user approves and schedules it. Provide `text` for a single post, or `threadParts` for a thread. Optionally suggest a time.",
  {
    text: z.string().optional(),
    threadParts: z.array(z.string()).optional().describe("each tweet of a thread, in order"),
    quotePostId: z.string().optional(),
    replyToPostId: z.string().optional(),
    suggestedScheduledAt: z.string().optional().describe("ISO-8601 suggested time"),
    timezone: z.string().optional().describe("IANA tz, e.g. America/Toronto"),
  },
  async (a) =>
    ok(
      await call("/drafts", {
        method: "POST",
        body: JSON.stringify({
          text: a.text,
          threadParts: a.threadParts,
          quotePostId: a.quotePostId,
          replyToPostId: a.replyToPostId,
          scheduledAt: a.suggestedScheduledAt,
          timezone: a.timezone,
        }),
      }),
    ),
);

server.tool(
  "list_queue",
  "List drafts awaiting the user's approval and posts already scheduled to publish.",
  {},
  async () => {
    const [drafts, scheduled] = await Promise.all([
      call("/drafts") as Promise<{ drafts: unknown[] }>,
      call("/scheduled-posts") as Promise<{ scheduledPosts: unknown[] }>,
    ]);
    return ok({ drafts: drafts.drafts, scheduled: scheduled.scheduledPosts });
  },
);

server.tool(
  "schedule_draft",
  "Approve a draft and schedule it — the Quill worker will post it at this time. Use only when the user has approved it.",
  {
    id: z.string(),
    scheduledAt: z.string().describe("ISO-8601 time to post"),
    timezone: z.string().describe("IANA tz, e.g. America/Toronto"),
  },
  async (a) =>
    ok(
      await call(`/drafts/${a.id}/schedule`, {
        method: "POST",
        body: JSON.stringify({ scheduledAt: a.scheduledAt, timezone: a.timezone }),
      }),
    ),
);

server.tool(
  "discard_draft",
  "Delete a draft the user doesn't want.",
  { id: z.string() },
  async ({ id }) => ok(await call(`/drafts/${id}`, { method: "DELETE" })),
);

server.tool(
  "cancel_scheduled",
  "Cancel a scheduled post so it won't publish.",
  { id: z.string() },
  async ({ id }) => ok(await call(`/scheduled-posts/${id}`, { method: "DELETE" })),
);

server.tool(
  "set_default_cta",
  "Set the default call-to-action reply text.",
  { text: z.string() },
  async ({ text }) => ok(await call("/cta", { method: "PUT", body: JSON.stringify({ text }) })),
);

server.tool(
  "create_cta_automation",
  "Auto-reply with a CTA once a given post crosses a like threshold (fires once, 7-day window).",
  {
    sourceXPostId: z.string(),
    ctaText: z.string(),
    likeThreshold: z.number().int().positive(),
  },
  async (a) => ok(await call("/cta/automations", { method: "POST", body: JSON.stringify(a) })),
);

server.tool(
  "create_repost_rule",
  "Repost an evergreen post on a cadence (every N hours).",
  {
    sourceUrl: z.string(),
    cadenceHours: z.number().int().positive(),
    nextRunAt: z.string().describe("ISO-8601 first run time"),
  },
  async (a) => ok(await call("/repost-rules", { method: "POST", body: JSON.stringify(a) })),
);

const transport = new StdioServerTransport();
await server.connect(transport);
