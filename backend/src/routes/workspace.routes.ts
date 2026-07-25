import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { requireUserId } from "../lib/auth.js";
import { listManagedAccounts } from "../services/managed-account.service.js";
import { ScheduleService } from "../services/schedule.service.js";
import { ArticleService } from "../services/article.service.js";

// Shared read model for the private two-member workspace. It intentionally
// returns content metadata only, never X credentials or token-related fields.
export async function registerWorkspaceRoutes(app: FastifyInstance, prisma: PrismaClient) {
  const schedule = new ScheduleService(prisma);
  const articles = new ArticleService(prisma);

  app.get("/api/workspace", async (request) => {
    const accounts = await listManagedAccounts(prisma, requireUserId(request));
    const items = await Promise.all(accounts.map(async (account) => ({
      account,
      queue: await schedule.listQueue(account.id),
      articles: await articles.list(account.id)
    })));
    return { accounts: items };
  });
}
