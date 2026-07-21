import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { requireUserId } from "../lib/auth.js";
import { ResearchService } from "../services/research.service.js";

const itemType = z.enum(["POST", "THREAD", "PROFILE", "ARTICLE", "NOTE"]);
const itemStatus = z.enum(["NEW", "KEPT", "JUNK", "REPLY_READY", "USED", "ARCHIVED"]);
const itemSchema = z.object({
  type: itemType.default("POST"),
  url: z.string().url(),
  xPostId: z.string().min(1).optional(),
  sourceHandle: z.string().max(100).optional(),
  authorName: z.string().max(200).optional(),
  title: z.string().max(500).optional(),
  text: z.string().max(100_000).optional(),
  raw: z.unknown().optional(),
  matchedKeywords: z.array(z.string().min(1).max(100)).max(100).optional()
});

function isExtension(request: { quillAuthKind?: string }) {
  return request.quillAuthKind === "extension";
}

export async function registerResearchRoutes(app: FastifyInstance, prisma: PrismaClient) {
  const research = new ResearchService(prisma);

  app.get("/api/research/items", async (request) => {
    const query = z.object({
      status: itemStatus.optional(),
      type: itemType.optional(),
      xPostId: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(500).default(100)
    }).parse(request.query ?? {});
    return { items: await research.list(requireUserId(request), query) };
  });

  app.post("/api/research/items", async (request) => {
    const item = itemSchema.parse(request.body);
    return { item: await research.capture(requireUserId(request), item) };
  });

  app.post("/api/research/items/bulk", async (request, reply) => {
    const parsed = z.array(itemSchema).min(1).max(200).safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "invalid_research_batch",
        message: "A research save can contain 1 to 200 items. Large profile captures are saved in batches automatically."
      });
    }
    const captured = await research.captureBulk(requireUserId(request), parsed.data);
    return { count: captured.length, items: captured };
  });

  app.patch("/api/research/items/:id", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const patch = z.object({
      status: itemStatus.optional(),
      importance: z.number().int().min(0).max(100).optional(),
      reason: z.string().max(500).nullable().optional()
    }).refine((value) => Object.keys(value).length > 0).parse(request.body);
    const item = await research.updateItem(requireUserId(request), params.id, patch);
    return item ? { item } : reply.code(404).send({ error: "research_item_not_found" });
  });

  app.delete("/api/research/items/:id", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const result = await research.archive(requireUserId(request), params.id);
    return result.ok ? result : reply.code(404).send({ error: "research_item_not_found" });
  });

  // Queue deletion is intentionally an archive: the item disappears from the
  // person's active queue but nothing is ever deleted from X itself.
  app.delete("/api/research/items", async (request) => (
    research.archiveAll(requireUserId(request))
  ));

  app.post("/api/research/articles/cleanup", async (request) => (
    research.archiveLegacyArticleWrappers(requireUserId(request))
  ));

  app.get("/api/research/rules", async (request) => ({
    rules: await research.listRules(requireUserId(request))
  }));

  app.post("/api/research/rules", async (request) => {
    const body = z.object({
      kind: z.enum(["MATCH", "EXCLUDE", "PRIORITY"]),
      value: z.string().trim().min(1).max(120)
    }).parse(request.body);
    return { rule: await research.saveRule(requireUserId(request), body) };
  });

  app.delete("/api/research/rules/:id", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const result = await research.removeRule(requireUserId(request), params.id);
    return result.ok ? result : reply.code(404).send({ error: "research_rule_not_found" });
  });

  // The old VPS worker becomes a Quill-owned batch: selected X captures are
  // prepared with the dedicated reply profile and stored as copyable, non-posting
  // replies. Extension tokens may call this research-only endpoint.
  app.post("/api/research/prepare", async (request) => {
    const body = z.object({ limit: z.number().int().min(1).max(20).default(5) }).parse(request.body ?? {});
    return research.prepareReplies(requireUserId(request), body.limit);
  });

  app.post("/api/research/items/:id/prepare", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    try {
      const item = await research.prepareReplyForItem(requireUserId(request), params.id);
      return item ? { item, reply: item.generatedReply } : reply.code(404).send({ error: "research_item_not_found" });
    } catch (error) {
      return reply.code(503).send({ error: error instanceof Error ? error.message : "reply_generation_failed" });
    }
  });

  app.post("/api/research/quick-next", async (request) => {
    const body = z.object({ limit: z.number().int().min(1).max(10).default(5) }).parse(request.body ?? {});
    return { items: await research.nextReady(requireUserId(request), body.limit) };
  });

  app.post("/api/research/replies/:id/copied", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const result = await research.markReplyCopied(requireUserId(request), params.id);
    return result.ok ? result : reply.code(404).send({ error: "research_reply_not_found" });
  });

  // Draft creation deliberately stays agent/browser-only. Capturing a post in
  // Chrome can never turn into an X reply without the user's agent reviewing it.
  app.post("/api/research/items/:id/draft", async (request, reply) => {
    if (isExtension(request)) return reply.code(403).send({ error: "extension_token_scope" });
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ text: z.string().trim().min(1).max(25_000) }).parse(request.body);
    const result = await research.createReplyDraft(requireUserId(request), params.id, body.text);
    if ("error" in result) return reply.code(result.error === "research_item_not_found" ? 404 : 409).send(result);
    return result;
  });
}
