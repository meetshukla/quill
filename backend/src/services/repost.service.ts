import type { PrismaClient, XAccount } from "@prisma/client";
import { randomIdempotencySeed } from "../lib/idempotency.js";
import { parseXPostId } from "../lib/x-post-url.js";
import { XClientService } from "./x-client.service.js";

export class RepostService {
  private readonly xClient: XClientService;

  constructor(private readonly prisma: PrismaClient) {
    this.xClient = new XClientService(prisma);
  }

  async validateUrl(xAccount: XAccount, sourceUrl: string) {
    const sourceXPostId = parseXPostId(sourceUrl);
    if (!sourceXPostId) throw new Error("Invalid X post URL");
    const preview = await this.xClient.lookupPosts(xAccount, [sourceXPostId], false);
    return { sourceXPostId, post: preview.data?.[0] ?? null };
  }

  async createRule(input: {
    xAccountId: string;
    sourceUrl: string;
    cadenceHours: number;
    nextRunAt: Date;
  }) {
    const sourceXPostId = parseXPostId(input.sourceUrl);
    if (!sourceXPostId) throw new Error("Invalid X post URL");
    return this.prisma.autoRepostRule.create({
      data: {
        xAccountId: input.xAccountId,
        sourceUrl: input.sourceUrl,
        sourceXPostId,
        cadenceHours: input.cadenceHours,
        nextRunAt: input.nextRunAt,
        idempotencySeed: randomIdempotencySeed("repost")
      }
    });
  }

  async listRules(xAccountId: string) {
    return this.prisma.autoRepostRule.findMany({
      where: { xAccountId },
      orderBy: { nextRunAt: "asc" },
      take: 100
    });
  }

  async setStatus(id: string, xAccountId: string, status: "ACTIVE" | "PAUSED") {
    await this.prisma.autoRepostRule.updateMany({
      where: { id, xAccountId },
      data: { status }
    });
    return this.prisma.autoRepostRule.findFirst({ where: { id, xAccountId } });
  }

  async deleteRule(id: string, xAccountId: string) {
    await this.prisma.autoRepostRule.deleteMany({ where: { id, xAccountId } });
    return { ok: true };
  }

  async executeDue(now = new Date()) {
    const due = await this.prisma.autoRepostRule.findMany({
      where: { status: "ACTIVE", nextRunAt: { lte: now } },
      include: { xAccount: true },
      take: 25,
      orderBy: { nextRunAt: "asc" }
    });

    for (const rule of due) {
      try {
        const result = await this.xClient.repost(rule.xAccount, rule.sourceXPostId);
        await this.prisma.autoRepostRule.update({
          where: { id: rule.id },
          data: {
            lastRunAt: now,
            nextRunAt: new Date(now.getTime() + rule.cadenceHours * 60 * 60 * 1000),
            lastRepostXPostId: result.data?.retweeted ? rule.sourceXPostId : undefined,
            errorMessage: null
          }
        });
      } catch (error) {
        await this.prisma.autoRepostRule.update({
          where: { id: rule.id },
          data: {
            status: "FAILED",
            errorMessage: error instanceof Error ? error.message : String(error)
          }
        });
      }
    }
  }
}
