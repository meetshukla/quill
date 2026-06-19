import type { PrismaClient, XOperationType } from "@prisma/client";

const OWNED_READ_COST_USD = 0.001;

export class XUsageService {
  constructor(private readonly prisma: PrismaClient) {}

  async logEvent(input: {
    xAccountId?: string;
    endpoint: string;
    method: string;
    operationType: XOperationType;
    statusCode?: number;
    resourcesReturned?: number;
    ownedResourcesCharged?: number;
    rateLimitLimit?: number;
    rateLimitRemaining?: number;
    rateLimitReset?: Date;
  }) {
    const ownedResourcesCharged = input.ownedResourcesCharged ?? 0;
    await this.prisma.xApiUsageEvent.create({
      data: {
        xAccountId: input.xAccountId,
        endpoint: input.endpoint,
        method: input.method,
        operationType: input.operationType,
        statusCode: input.statusCode,
        resourcesReturned: input.resourcesReturned ?? 0,
        ownedResourcesCharged,
        estimatedCostUsd:
          input.operationType === "OWNED_READ" ? ownedResourcesCharged * OWNED_READ_COST_USD : 0,
        rateLimitLimit: input.rateLimitLimit,
        rateLimitRemaining: input.rateLimitRemaining,
        rateLimitReset: input.rateLimitReset
      }
    });
  }

  async getDailyOwnedReadUsage(xAccountId: string, now = new Date()) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const result = await this.prisma.xApiUsageEvent.aggregate({
      _sum: { ownedResourcesCharged: true },
      where: {
        xAccountId,
        operationType: "OWNED_READ",
        createdAt: { gte: start }
      }
    });
    return result._sum.ownedResourcesCharged ?? 0;
  }

  async getMonthlyOwnedReadUsage(xAccountId: string, now = new Date()) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const result = await this.prisma.xApiUsageEvent.aggregate({
      _sum: { ownedResourcesCharged: true },
      where: {
        xAccountId,
        operationType: "OWNED_READ",
        createdAt: { gte: start }
      }
    });
    return result._sum.ownedResourcesCharged ?? 0;
  }
}

