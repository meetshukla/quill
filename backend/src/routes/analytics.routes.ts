import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AnalyticsService } from "../services/analytics.service.js";
import { requireUserId } from "../lib/auth.js";

export async function registerAnalyticsRoutes(app: FastifyInstance, prisma: PrismaClient) {
  const analytics = new AnalyticsService(prisma);

  app.get("/api/analytics/settings", async (request) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: requireUserId(request) } });
    return {
      analyticsEnabled: user.analyticsEnabled,
      analyticsWindowDays: user.analyticsWindowDays,
      analyticsRetentionDays: user.analyticsRetentionDays,
      analyticsMaxPosts: 500
    };
  });

  app.put("/api/analytics/settings", async (request) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: requireUserId(request) } });
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

  app.post("/api/analytics/sync", async (request) => {
    const xAccount = await prisma.xAccount.findUniqueOrThrow({ where: { userId: requireUserId(request) } });
    return analytics.syncLastSevenDays(xAccount);
  });

  app.get("/api/analytics/summary", async (request) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: requireUserId(request) } });
    if (!user.analyticsEnabled) return { disabled: true, summary: null };
    const xAccount = await prisma.xAccount.findUniqueOrThrow({ where: { userId: requireUserId(request) } });
    return { disabled: false, summary: await analytics.getSummary(xAccount.id) };
  });
}
