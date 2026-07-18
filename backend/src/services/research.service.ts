import type { PrismaClient, XAccount } from "@prisma/client";
import { ComposerService } from "./composer.service.js";

export const researchItemInclude = {
  researchDraft: {
    include: {
      scheduledPost: true
    }
  }
} as const;

export type CaptureResearchItem = {
  type: string;
  url: string;
  xPostId?: string;
  sourceHandle?: string;
  authorName?: string;
  title?: string;
  text?: string;
  raw?: unknown;
  matchedKeywords?: string[];
};

export class ResearchService {
  private readonly composer: ComposerService;

  constructor(private readonly prisma: PrismaClient) {
    this.composer = new ComposerService(prisma);
  }

  capture(userId: string, item: CaptureResearchItem) {
    const url = item.url.trim();
    return this.prisma.researchItem.upsert({
      where: { userId_url: { userId, url } },
      create: {
        userId,
        type: item.type,
        url,
        xPostId: clean(item.xPostId),
        sourceHandle: cleanHandle(item.sourceHandle),
        authorName: clean(item.authorName),
        title: clean(item.title),
        text: item.text?.trim() ?? "",
        raw: item.raw as never,
        matchedKeywords: item.matchedKeywords ?? []
      },
      update: {
        type: item.type,
        xPostId: clean(item.xPostId),
        sourceHandle: cleanHandle(item.sourceHandle),
        authorName: clean(item.authorName),
        title: clean(item.title),
        text: item.text?.trim() ?? "",
        raw: item.raw as never,
        matchedKeywords: item.matchedKeywords ?? [],
        capturedAt: new Date()
      },
      include: researchItemInclude
    });
  }

  list(userId: string, filters: { status?: string; type?: string; limit: number }) {
    return this.prisma.researchItem.findMany({
      where: { userId, status: filters.status, type: filters.type },
      include: researchItemInclude,
      orderBy: [{ importance: "desc" }, { capturedAt: "desc" }],
      take: filters.limit
    });
  }

  async updateItem(
    userId: string,
    id: string,
    patch: { status?: string; importance?: number; reason?: string | null }
  ) {
    const result = await this.prisma.researchItem.updateMany({
      where: { id, userId },
      data: patch
    });
    if (!result.count) return null;
    return this.prisma.researchItem.findFirst({ where: { id, userId }, include: researchItemInclude });
  }

  async archive(userId: string, id: string) {
    const result = await this.prisma.researchItem.updateMany({
      where: { id, userId },
      data: { status: "ARCHIVED" }
    });
    return { ok: result.count > 0 };
  }

  listRules(userId: string) {
    return this.prisma.researchRule.findMany({
      where: { userId, enabled: true },
      orderBy: [{ kind: "asc" }, { value: "asc" }]
    });
  }

  async saveRule(userId: string, input: { kind: string; value: string }) {
    const value = input.value.trim().toLowerCase();
    return this.prisma.researchRule.upsert({
      where: { userId_kind_value: { userId, kind: input.kind, value } },
      create: { userId, kind: input.kind, value },
      update: { enabled: true }
    });
  }

  async removeRule(userId: string, id: string) {
    const result = await this.prisma.researchRule.updateMany({
      where: { id, userId },
      data: { enabled: false }
    });
    return { ok: result.count > 0 };
  }

  async createReplyDraft(userId: string, itemId: string, text: string) {
    const item = await this.prisma.researchItem.findFirst({ where: { id: itemId, userId } });
    if (!item) return { error: "research_item_not_found" as const };
    if (!item.xPostId) return { error: "research_item_has_no_x_post" as const };
    const xAccount = await this.prisma.xAccount.findUnique({ where: { userId } });
    if (!xAccount) return { error: "x_account_not_connected" as const };

    const existing = await this.prisma.researchDraft.findUnique({
      where: { researchItemId: item.id },
      select: { id: true }
    });
    if (existing) return { error: "research_draft_already_exists" as const };

    const scheduledPost = await this.composer.createDraft({
      xAccount: xAccount as XAccount,
      text: text.trim(),
      replyToPostId: item.xPostId
    });
    const researchDraft = await this.prisma.researchDraft.create({
      data: { researchItemId: item.id, scheduledPostId: scheduledPost.id },
      include: { scheduledPost: true }
    });
    await this.prisma.researchItem.update({ where: { id: item.id }, data: { status: "REPLY_READY" } });
    return { researchDraft };
  }
}

function clean(value: string | undefined) {
  const result = value?.trim();
  return result || null;
}

function cleanHandle(value: string | undefined) {
  const result = clean(value);
  return result?.replace(/^@/, "") || null;
}
