import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AnalyticsService } from "../services/analytics.service.js";

export async function registerAnalyticsRoutes(app: FastifyInstance, prisma: PrismaClient) {
  const analytics = new AnalyticsService(prisma);

  app.get("/api/analytics/settings", async () => {
    const user = await prisma.user.findFirstOrThrow();
    return {
      analyticsEnabled: user.analyticsEnabled,
      analyticsWindowDays: user.analyticsWindowDays,
      analyticsRetentionDays: user.analyticsRetentionDays,
      analyticsMaxPosts: 500
    };
  });

  app.put("/api/analytics/settings", async (request) => {
    const user = await prisma.user.findFirstOrThrow();
    const body = z
      .object({
        analyticsEnabled: z.boolean(),
        analyticsWindowDays: z.number().int().min(1).max(7).default(7),
        analyticsRetentionDays: z.number().int().min(1).max(30).default(14)
      })
      .parse(request.body);
    return {
      settings: await prisma.user.update({
        where: { id: user.id },
        data: body,
        select: {
          analyticsEnabled: true,
          analyticsWindowDays: true,
          analyticsRetentionDays: true
        }
      })
    };
  });

  app.post("/api/analytics/sync", async () => {
    const xAccount = await prisma.xAccount.findFirstOrThrow();
    return analytics.syncLastSevenDays(xAccount);
  });

  app.get("/api/analytics/summary", async () => {
    const user = await prisma.user.findFirstOrThrow();
    if (!user.analyticsEnabled) return { disabled: true, summary: null };
    const xAccount = await prisma.xAccount.findFirstOrThrow();
    return { disabled: false, summary: await analytics.getSummary(xAccount.id) };
  });
}

