import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { PrismaClient } from "@prisma/client";
import { buildQuillMcpServer } from "../src/mcp/server.js";

test("Quill MCP exposes the complete review-first scheduling surface", async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = buildQuillMcpServer({ prisma: {} as PrismaClient, userId: "test-user" });
  const client = new Client({ name: "quill-mcp-test", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const { tools } = await client.listTools();
  const names = new Set(tools.map((tool) => tool.name));
  for (const name of [
    "get_quill_status",
    "get_profiles",
    "search_research",
    "upload_media_asset",
    "create_draft",
    "schedule_draft",
    "list_scheduled_posts",
    "create_article_draft",
    "create_article_review",
    "schedule_article",
    "create_cta_automation",
    "create_repost_rule"
  ]) {
    assert.equal(names.has(name), true, `missing ${name}`);
  }
  assert.equal(names.has("publish_now"), false, "MCP must preserve human approval before publishing");

  await client.close();
  await server.close();
});
