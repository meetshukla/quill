import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { ComposerService } from "../services/composer.service.js";
import { ScheduleService } from "../services/schedule.service.js";

const draftSchema = z.object({
  text: z.string().optional(),
  quotePostId: z.string().optional(),
  replyToPostId: z.string().optional(),
  mediaIds: z.array(z.string()).optional(),
  threadParts: z.array(z.string()).optional(),
  scheduledAt: z.string().datetime().optional(),
  timezone: z.string().optional()
});

export async function registerDraftRoutes(app: FastifyInstance, prisma: PrismaClient) {
  const composer = new ComposerService(prisma);
  const scheduler = new ScheduleService(prisma);

  // Drafts the agent has proposed, awaiting the user's approval.
  app.get("/api/drafts", async () => {
    const xAccount = await prisma.xAccount.findFirst();
    if (!xAccount) return { drafts: [] };
    return { drafts: await scheduler.listDrafts(xAccount.id) };
  });

  app.post("/api/drafts", async (request) => {
    const xAccount = await prisma.xAccount.findFirstOrThrow();
    const { scheduledAt, timezone, ...rest } = draftSchema.parse(request.body);
    return {
      draft: await composer.createDraft({
        xAccount,
        ...rest,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        timezone
      })
    };
  });

  // Approve a draft → moves it into the queue for the worker to publish.
  app.post("/api/drafts/:id/schedule", async (request) => {
    const xAccount = await prisma.xAccount.findFirstOrThrow();
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({ scheduledAt: z.string().datetime(), timezone: z.string().min(1) })
      .parse(request.body);
    return {
      scheduledPost: await scheduler.scheduleDraft(
        params.id,
        xAccount.id,
        new Date(body.scheduledAt),
        body.timezone
      )
    };
  });

  app.delete("/api/drafts/:id", async (request) => {
    const xAccount = await prisma.xAccount.findFirstOrThrow();
    const params = z.object({ id: z.string() }).parse(request.params);
    return scheduler.deleteDraft(params.id, xAccount.id);
  });
}
