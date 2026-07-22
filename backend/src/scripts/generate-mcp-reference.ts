/**
 * Generate the public Fumadocs MCP reference from the actual registered tools.
 *
 * The server is connected through an in-memory transport, so this catches a
 * renamed or undocumented tool before docs are committed or deployed.
 *
 * Run: pnpm docs:generate-mcp
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { PrismaClient } from "@prisma/client";

// Tool registration imports services that validate the normal runtime env.
// Reference generation never touches a database or X, so deterministic local
// placeholders let it run in CI without loading a private .env file.
process.env.DATABASE_URL ??= "file:/tmp/quill-mcp-docs.db";
process.env.APP_BASE_URL ??= "https://quill.invalid";
process.env.API_BASE_URL ??= "https://api.quill.invalid";
process.env.JWT_SECRET ??= "docs-only-secret-that-is-long-enough-for-validation";
process.env.ENCRYPTION_KEY_BASE64 ??= Buffer.alloc(32).toString("base64");

const { buildQuillMcpServer } = await import("../mcp/server.js");

const outputDir = path.resolve(process.cwd(), "..", "frontend", "content", "docs", "reference");

const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const server = buildQuillMcpServer({ prisma: {} as PrismaClient, userId: "docs-generator" });
await server.connect(serverTransport);
const client = new Client({ name: "quill-docs-generator", version: "1.0.0" });
await client.connect(clientTransport);

const { tools } = await client.listTools();
await client.close();
await server.close();

const groups: Array<{ slug: string; title: string; description: string; names: string[] }> = [
  { slug: "account-profiles", title: "Account and profiles", description: "Inspect private profiles and the owned-post voice corpus.", names: ["get_quill_status", "get_profiles", "update_profile", "sync_owned_posts", "list_owned_posts"] },
  { slug: "research-replies", title: "Research and replies", description: "Search the corpus, manage Manual scan rules, and prepare copy-only replies.", names: ["search_research", "get_research_index", "capture_research", "list_research_rules", "save_research_rule", "prepare_replies", "get_next_replies"] },
  { slug: "media", title: "Media assets", description: "Store, attach, list, and safely remove owned media.", names: ["list_media_assets", "upload_media_asset", "delete_media_asset"] },
  { slug: "posts-scheduling", title: "Post drafts and scheduling", description: "Create private posts, replies, quotes, threads, and manage the approved schedule.", names: ["create_draft", "list_drafts", "schedule_draft", "discard_draft", "list_scheduled_posts", "cancel_scheduled_post"] },
  { slug: "articles", title: "Native X Articles", description: "Create a private Article, materialize an X review, then schedule the reviewed version.", names: ["create_article_draft", "create_article_review", "list_articles", "schedule_article"] },
  { slug: "automations", title: "Automations", description: "Manage CTA replies and evergreen repost rules.", names: ["get_cta_setting", "set_cta_setting", "list_cta_automations", "create_cta_automation", "delete_cta_automation", "list_repost_rules", "create_repost_rule", "set_repost_rule_status", "delete_repost_rule"] }
];

const byName = new Map(tools.map((tool) => [tool.name, tool]));
const expected = new Set(groups.flatMap((group) => group.names));
const unmapped = tools.map((tool) => tool.name).filter((name) => !expected.has(name));
const missing = groups.flatMap((group) => group.names).filter((name) => !byName.has(name));
if (unmapped.length || missing.length) {
  throw new Error(`MCP docs mapping is out of date. Unmapped: ${unmapped.join(", ") || "none"}; missing: ${missing.join(", ") || "none"}`);
}

const kind = (tool: (typeof tools)[number]) => tool.annotations?.destructiveHint ? "Destructive" : tool.annotations?.readOnlyHint ? "Read" : "Write";
const render = (name: string) => {
  const tool = byName.get(name)!;
  const schema = tool.inputSchema && Object.keys(tool.inputSchema.properties ?? {}).length > 0
    ? `\n\n\`\`\`json title="Input schema"\n${JSON.stringify(tool.inputSchema, null, 2)}\n\`\`\``
    : "\n\n_No input._";
  return `## \`${tool.name}\`\n\n**${kind(tool)} tool.** ${tool.description ?? ""}${schema}`;
};

await mkdir(outputDir, { recursive: true });
await Promise.all(groups.map((group) => {
  const markdown = [
    "---",
    `title: ${group.title}`,
    `description: ${group.description}`,
    "---",
    "",
    "{/* GENERATED FILE. Run `pnpm docs:generate-mcp` from backend. */}",
    "",
    "Every tool is scoped to the bearer key's Quill user and X API connection.",
    "",
    ...group.names.map(render),
    ""
  ].join("\n");
  return writeFile(path.join(outputDir, `${group.slug}.mdx`), markdown);
}));
console.log(`Generated ${groups.length} MCP reference pages from ${tools.length} live MCP tools.`);
