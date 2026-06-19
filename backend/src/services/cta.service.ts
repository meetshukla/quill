import type { PrismaClient, XAccount } from "@prisma/client";
import { addDays } from "../lib/time.js";
import { randomIdempotencySeed } from "../lib/idempotency.js";
import { XClientService } from "./x-client.service.js";

export class CtaService {
  private readonly xClient: XClientService;

  constructor(private readonly prisma: PrismaClient) {
    this.xClient = new XClientService(prisma);
  }

  async getSetting(xAccountId: string) {
    return this.prisma.ctaSetting.findUnique({ where: { xAccountId } });
  }

  async saveSetting(xAccountId: string, text: string) {
    return this.prisma.ctaSetting.upsert({
      where: { xAccountId },
      create: { xAccountId, text },
      update: { text }
    });
  }

  async createAutomation(input: {
    xAccountId: string;
    sourceXPostId: string;
    ctaText: string;
    likeThreshold: number;
  }) {
    return this.prisma.ctaAutomation.create({
      data: {
        ...input,
        status: "ACTIVE",
        expiresAt: addDays(new Date(), 7),
        idempotencyKey: randomIdempotencySeed("cta")
      }
    });
  }

  async listAutomations(xAccountId: string) {
    return this.prisma.ctaAutomation.findMany({
      where: { xAccountId },
      orderBy: { createdAt: "desc" },
      take: 100
    });
  }

  async deleteAutomation(id: string, xAccountId: string) {
    await this.prisma.ctaAutomation.deleteMany({ where: { id, xAccountId } });
    return { ok: true };
  }

  async checkPending(now = new Date()) {
    const pending = await this.prisma.ctaAutomation.findMany({
      where: { status: "ACTIVE", expiresAt: { gt: now } },
      include: { xAccount: true },
      take: 100
    });

    for (const automation of pending) {
      await this.checkOne(automation.xAccount, automation.id, automation.sourceXPostId);
    }
  }

  private async checkOne(xAccount: XAccount, automationId: string, sourceXPostId: string) {
    const automation = await this.prisma.ctaAutomation.findUniqueOrThrow({ where: { id: automationId } });
    const lookup = await this.xClient.lookupPosts(xAccount, [sourceXPostId], true);
    const post = lookup.data?.[0];
    const likes = post?.public_metrics?.like_count ?? post?.organic_metrics?.like_count ?? 0;

    if (likes < automation.likeThreshold) {
      await this.prisma.ctaAutomation.update({
        where: { id: automationId },
        data: { lastCheckedAt: new Date() }
      });
      return;
    }

    const reply = await this.xClient.createPost(xAccount, {
      text: automation.ctaText,
      reply: { in_reply_to_tweet_id: sourceXPostId }
    });

    await this.prisma.ctaAutomation.update({
      where: { id: automationId },
      data: {
        status: "POSTED",
        replyXPostId: reply.data?.id,
        postedAt: new Date(),
        lastCheckedAt: new Date()
      }
    });
  }
}

