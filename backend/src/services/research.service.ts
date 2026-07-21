import type { PrismaClient, XAccount } from "@prisma/client";
import { ComposerService } from "./composer.service.js";
import { ReplyGenerationService } from "./reply-generation.service.js";
import { env } from "../config/env.js";

export const researchItemInclude = {
  researchDraft: {
    include: {
      scheduledPost: true
    }
  },
  generatedReply: true
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

// Imported from the established X marketing workflow. These are per-person
// defaults: people can add their own rules or disable any of these later.
const DEFAULT_RESEARCH_RULES = [
  "tiktok", "viral", "viral hook", "viral angle", "go viral", "viral loop",
  "hook", "winning hook", "reaction hook", "downloads", "hit downloads",
  "crossed downloads", "views", "organic views", "million views", "creators",
  "ugc creators", "hire creators", "ugc", "clone", "cloned", "farm",
  "tiktok farm", "farming", "reaction", "reaction video", "demo", "app demo",
  "revenue", "$k/mo", "$k mrr", "organic", "organic growth", "in-house",
  "in-house agency", "vibe coding", "vibe-coded", "pov", "motion control",
  "kling", "slideshow", "app marketing", "short form video", "ai ugc",
  "ai video", "app store"
].map((value) => ({ kind: "MATCH", value }));

const DEFAULT_EXCLUDE_RULES = ["giveaway", "airdrop", "crypto pump", "hiring", "web3", "course launch"]
  .map((value) => ({ kind: "EXCLUDE", value }));

export class ResearchService {
  private readonly composer: ComposerService;
  private readonly generation: ReplyGenerationService;

  constructor(private readonly prisma: PrismaClient) {
    this.composer = new ComposerService(prisma);
    this.generation = new ReplyGenerationService();
  }

  async captureBulk(userId: string, items: CaptureResearchItem[]) {
    const captured = [];
    for (const item of items.slice(0, 200)) captured.push(await this.capture(userId, item));
    return captured;
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

  list(userId: string, filters: { status?: string; type?: string; xPostId?: string; limit: number }) {
    return this.prisma.researchItem.findMany({
      where: {
        userId,
        status: filters.status ?? { not: "ARCHIVED" },
        type: filters.type,
        xPostId: filters.xPostId
      },
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

  async archiveAll(userId: string) {
    const result = await this.prisma.researchItem.updateMany({
      where: { userId, status: { not: "ARCHIVED" } },
      data: { status: "ARCHIVED" }
    });
    return { archived: result.count };
  }

  // Early article imports used X's /status route, which is a conversation
  // wrapper rather than the article reader. Archive only those legacy records;
  // the data remains recoverable but is removed from the active corpus.
  async archiveLegacyArticleWrappers(userId: string) {
    const wrappers = await this.prisma.researchItem.findMany({
      where: { userId, type: "ARTICLE", url: { contains: "/status/" }, status: { not: "ARCHIVED" } },
      select: { id: true }
    });
    if (!wrappers.length) return { archived: 0 };
    const result = await this.prisma.researchItem.updateMany({
      where: { userId, id: { in: wrappers.map((item) => item.id) } },
      data: { status: "ARCHIVED", reason: "Legacy X status-page article wrapper" }
    });
    return { archived: result.count };
  }

  async listRules(userId: string) {
    await this.ensureDefaultRules(userId);
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

  private async ensureDefaultRules(userId: string) {
    await this.prisma.$transaction(
      [...DEFAULT_RESEARCH_RULES, ...DEFAULT_EXCLUDE_RULES].map((rule) =>
        this.prisma.researchRule.upsert({
          where: { userId_kind_value: { userId, kind: rule.kind, value: rule.value } },
          create: { userId, kind: rule.kind, value: rule.value },
          // A person who disabled a default keeps that choice. Missing rules
          // are added; existing rules are never overwritten here.
          update: {}
        })
      )
    );
  }

  async removeRule(userId: string, id: string) {
    const result = await this.prisma.researchRule.updateMany({
      where: { id, userId },
      data: { enabled: false }
    });
    return { ok: result.count > 0 };
  }

  async prepareReplies(userId: string, limit: number) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { replyProfile: true }
    });
    const items = await this.prisma.researchItem.findMany({
      where: {
        userId,
        type: { in: ["POST", "THREAD"] },
        status: { in: ["NEW", "KEPT"] },
        generatedReply: null
      },
      orderBy: [{ importance: "desc" }, { capturedAt: "asc" }],
      take: limit
    });
    let prepared = 0;
    let skipped = 0;
    const errors: Array<{ id: string; error: string }> = [];
    for (const item of items) {
      try {
        const text = await this.generation.generateReply(user, item);
        if (!text) {
          await this.prisma.researchItem.update({
            where: { id: item.id },
            data: { status: "JUNK", reason: "No natural reply angle" }
          });
          skipped += 1;
          continue;
        }
        await this.prisma.$transaction([
          this.prisma.researchReply.create({
            data: { researchItemId: item.id, text, provider: "gemini", model: env.AI_MODEL }
          }),
          this.prisma.researchItem.update({
            where: { id: item.id },
            data: { status: "REPLY_READY", reason: "Reply prepared by Quill" }
          })
        ]);
        prepared += 1;
      } catch (error) {
        errors.push({ id: item.id, error: error instanceof Error ? error.message : "generation_failed" });
      }
    }
    return { prepared, skipped, errors };
  }

  async prepareReplyForItem(userId: string, itemId: string) {
    const item = await this.prisma.researchItem.findFirst({
      where: { id: itemId, userId, type: { in: ["POST", "THREAD"] } },
      include: researchItemInclude
    });
    if (!item) return null;
    if (item.generatedReply) return item;

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { replyProfile: true }
    });
    const text = await this.generation.generateReply(user, item);
    if (!text) {
      return this.prisma.researchItem.update({
        where: { id: item.id },
        data: { status: "JUNK", reason: "No natural reply angle" },
        include: researchItemInclude
      });
    }
    await this.prisma.$transaction([
      this.prisma.researchReply.upsert({
        where: { researchItemId: item.id },
        create: { researchItemId: item.id, text, provider: "gemini", model: env.AI_MODEL },
        update: {}
      }),
      this.prisma.researchItem.update({
        where: { id: item.id },
        data: { status: "REPLY_READY", reason: "Reply prepared by Quill" }
      })
    ]);
    return this.prisma.researchItem.findUniqueOrThrow({ where: { id: item.id }, include: researchItemInclude });
  }

  async nextReady(userId: string, limit: number) {
    const items = await this.prisma.researchItem.findMany({
      where: {
        userId,
        status: "REPLY_READY",
        openedAt: null,
        generatedReply: { is: { status: "READY" } }
      },
      include: researchItemInclude,
      orderBy: [{ importance: "desc" }, { capturedAt: "asc" }],
      take: limit
    });
    if (items.length) {
      await this.prisma.researchItem.updateMany({
        where: { id: { in: items.map((item) => item.id) }, userId },
        data: { openedAt: new Date() }
      });
    }
    return items;
  }

  async markReplyCopied(userId: string, replyId: string) {
    const reply = await this.prisma.researchReply.findFirst({
      where: { id: replyId, researchItem: { userId } },
      select: { id: true, researchItemId: true }
    });
    if (!reply) return { ok: false };
    await this.prisma.$transaction([
      this.prisma.researchReply.update({ where: { id: reply.id }, data: { status: "COPIED" } }),
      this.prisma.researchItem.update({ where: { id: reply.researchItemId }, data: { status: "USED" } })
    ]);
    return { ok: true };
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
