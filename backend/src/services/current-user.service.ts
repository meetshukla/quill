import type { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";

export async function getCurrentUser(prisma: PrismaClient) {
  return prisma.user.upsert({
    where: { email: env.DEFAULT_USER_EMAIL },
    create: {
      email: env.DEFAULT_USER_EMAIL,
      name: env.DEFAULT_USER_NAME,
      analyticsEnabled: env.ANALYTICS_ENABLED,
      analyticsWindowDays: env.ANALYTICS_WINDOW_DAYS,
      monthlyOwnedReadBudget: env.MONTHLY_OWNED_READ_BUDGET,
      dailyOwnedReadSoftLimit: env.DAILY_OWNED_READ_SOFT_LIMIT,
      dailyOwnedReadHardLimit: env.DAILY_OWNED_READ_HARD_LIMIT
    },
    update: {}
  });
}
