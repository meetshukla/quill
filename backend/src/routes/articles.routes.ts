import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { requireUserId } from "../lib/auth.js";
import { ArticleService } from "../services/article.service.js";

const contentState = z.object({ blocks: z.array(z.unknown()).min(1), entities: z.array(z.unknown()) });

export async function registerArticleRoutes(app: FastifyInstance, prisma: PrismaClient) {
  const articles = new ArticleService(prisma);

  app.get("/api/articles", async (request) => {
    const xAccount = await prisma.xAccount.findUniqueOrThrow({ where: { userId: requireUserId(request) } });
    return { articles: await articles.list(xAccount.id) };
  });

  app.post("/api/articles", async (request) => {
    const xAccount = await prisma.xAccount.findUniqueOrThrow({ where: { userId: requireUserId(request) } });
    const body = z.object({ title: z.string().trim().min(1).max(400), contentState, coverAssetId: z.string().uuid().optional() }).parse(request.body);
    return { article: await articles.createDraft({ xAccount, ...body }) };
  });

  app.post("/api/articles/:id/review", async (request) => {
    const xAccount = await prisma.xAccount.findUniqueOrThrow({ where: { userId: requireUserId(request) } });
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return { article: await articles.createXDraft(id, xAccount) };
  });

  app.post("/api/articles/:id/schedule", async (request) => {
    const xAccount = await prisma.xAccount.findUniqueOrThrow({ where: { userId: requireUserId(request) } });
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ scheduledAt: z.string().datetime(), timezone: z.string().min(1) }).parse(request.body);
    return { article: await articles.schedule(id, xAccount.id, new Date(body.scheduledAt), body.timezone) };
  });
}
