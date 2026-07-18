import type { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";
import { decryptSecret } from "../lib/crypto.js";
import { hashAgentKey } from "../lib/auth.js";

/**
 * Maps an older local installation onto a normal User account exactly once.
 * Existing X content is already related to this user through XAccount, so no
 * posts or tokens need to move.
 */
export async function ensureDefaultUser(prisma: PrismaClient) {
  const user = await prisma.user.upsert({
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

  const legacy = await prisma.appConfig.findUnique({ where: { id: "singleton" } });
  const data: { passwordHash?: string; agentApiKeyEncrypted?: string; agentApiKeyHash?: string } = {};
  if (!user.passwordHash && legacy?.legacyPasswordHash) data.passwordHash = legacy.legacyPasswordHash;
  if (!user.agentApiKeyEncrypted && legacy?.agentApiKeyEncrypted) {
    const key = decryptSecret(legacy.agentApiKeyEncrypted);
    data.agentApiKeyEncrypted = legacy.agentApiKeyEncrypted;
    data.agentApiKeyHash = hashAgentKey(key);
  }
  return Object.keys(data).length
    ? prisma.user.update({ where: { id: user.id }, data })
    : user;
}
