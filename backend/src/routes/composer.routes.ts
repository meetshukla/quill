import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { ComposerService } from "../services/composer.service.js";
import { ScheduleService } from "../services/schedule.service.js";
import { RepostService } from "../services/repost.service.js";
import { CtaService } from "../services/cta.service.js";

const postSchema = z.object({
  text: z.string().optional(),
  quotePostId: z.string().optional(),
  replyToPostId: z.string().optional(),
  mediaIds: z.array(z.string()).optional(),
  threadParts: z.array(z.string()).optional()
});

export async function registerComposerRoutes(app: FastifyInstance, prisma: PrismaClient) {
  const composer = new ComposerService(prisma);
  const scheduler = new ScheduleService(prisma);
  const repost = new RepostService(prisma);
  const cta = new CtaService(prisma);

  app.post("/api/composer/post", async (request) => {
    const xAccount = await prisma.xAccount.findFirstOrThrow();
    const body = postSchema.parse(request.body);
    return { post: await composer.publishNow({ xAccount, ...body }) };
  });

  app.post("/api/composer/schedule", async (request) => {
    const xAccount = await prisma.xAccount.findFirstOrThrow();
    const body = postSchema
      .extend({ scheduledAt: z.string().datetime(), timezone: z.string().min(1) })
      .parse(request.body);
    return {
      scheduledPost: await composer.createScheduledPost({
        xAccount,
        ...body,
        scheduledAt: new Date(body.scheduledAt)
      })
    };
  });

  app.get("/api/scheduled-posts", async () => {
    // No connected account yet → empty queue rather than a 500.
    const xAccount = await prisma.xAccount.findFirst();
    if (!xAccount) return { scheduledPosts: [] };
    return { scheduledPosts: await scheduler.listScheduled(xAccount.id) };
  });

  app.delete("/api/scheduled-posts/:id", async (request) => {
    const xAccount = await prisma.xAccount.findFirstOrThrow();
    const params = z.object({ id: z.string() }).parse(request.params);
    return { scheduledPost: await scheduler.cancel(params.id, xAccount.id) };
  });

  app.post("/api/composer/quote-preview", async (request) => {
    const xAccount = await prisma.xAccount.findFirstOrThrow();
    const body = z.object({ postId: z.string() }).parse(request.body);
    return { post: await composer.quotePreview(xAccount, body.postId) };
  });

  app.get("/api/cta", async () => {
    const xAccount = await prisma.xAccount.findFirst();
    if (!xAccount) return { cta: null };
    return { cta: await cta.getSetting(xAccount.id) };
  });

  app.put("/api/cta", async (request) => {
    const xAccount = await prisma.xAccount.findFirstOrThrow();
    const body = z.object({ text: z.string() }).parse(request.body);
    return { cta: await cta.saveSetting(xAccount.id, body.text) };
  });

  app.get("/api/cta/automations", async () => {
    const xAccount = await prisma.xAccount.findFirst();
    if (!xAccount) return { automations: [] };
    return { automations: await cta.listAutomations(xAccount.id) };
  });

  app.post("/api/cta/automations", async (request) => {
    const xAccount = await prisma.xAccount.findFirstOrThrow();
    const body = z
      .object({
        sourceXPostId: z.string().min(1),
        ctaText: z.string().min(1),
        likeThreshold: z.number().int().positive()
      })
      .parse(request.body);
    return { automation: await cta.createAutomation({ xAccountId: xAccount.id, ...body }) };
  });

  app.delete("/api/cta/automations/:id", async (request) => {
    const xAccount = await prisma.xAccount.findFirstOrThrow();
    const params = z.object({ id: z.string() }).parse(request.params);
    return cta.deleteAutomation(params.id, xAccount.id);
  });

  app.post("/api/repost-rules/validate", async (request) => {
    const xAccount = await prisma.xAccount.findFirstOrThrow();
    const body = z.object({ sourceUrl: z.string().url() }).parse(request.body);
    return repost.validateUrl(xAccount, body.sourceUrl);
  });

  app.post("/api/repost-rules", async (request) => {
    const xAccount = await prisma.xAccount.findFirstOrThrow();
    const body = z
      .object({ sourceUrl: z.string().url(), cadenceHours: z.number().int().positive(), nextRunAt: z.string().datetime() })
      .parse(request.body);
    return {
      rule: await repost.createRule({
        xAccountId: xAccount.id,
        sourceUrl: body.sourceUrl,
        cadenceHours: body.cadenceHours,
        nextRunAt: new Date(body.nextRunAt)
      })
    };
  });

  app.get("/api/repost-rules", async () => {
    const xAccount = await prisma.xAccount.findFirst();
    if (!xAccount) return { rules: [] };
    return { rules: await repost.listRules(xAccount.id) };
  });

  app.patch("/api/repost-rules/:id", async (request) => {
    const xAccount = await prisma.xAccount.findFirstOrThrow();
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ status: z.enum(["ACTIVE", "PAUSED"]) }).parse(request.body);
    return { rule: await repost.setStatus(params.id, xAccount.id, body.status) };
  });

  app.delete("/api/repost-rules/:id", async (request) => {
    const xAccount = await prisma.xAccount.findFirstOrThrow();
    const params = z.object({ id: z.string() }).parse(request.params);
    return repost.deleteRule(params.id, xAccount.id);
  });
}

