import type { PrismaClient, ScheduledPost, XAccount } from "@prisma/client";
import { ComposerService } from "./composer.service.js";

export class ScheduleService {
  private readonly composer: ComposerService;

  constructor(private readonly prisma: PrismaClient) {
    this.composer = new ComposerService(prisma);
  }

  async listScheduled(xAccountId: string) {
    return this.prisma.scheduledPost.findMany({
      where: { xAccountId, status: "SCHEDULED" },
      orderBy: { scheduledAt: "asc" }
    });
  }

  async listDrafts(xAccountId: string) {
    return this.prisma.scheduledPost.findMany({
      where: { xAccountId, status: "DRAFT" },
      orderBy: { updatedAt: "desc" }
    });
  }

  // The Queue is a lifecycle view, not only a list of future work. Keep the
  // terminal record visible so a human can see what happened to every approval.
  async listQueue(xAccountId: string) {
    const records = await this.prisma.scheduledPost.findMany({
      where: {
        xAccountId,
        status: { in: ["DRAFT", "SCHEDULED", "POSTING", "FAILED", "POSTED"] }
      },
      orderBy: { updatedAt: "desc" },
      take: 500
    });
    const queue = {
      drafts: [] as ScheduledPost[],
      scheduled: [] as ScheduledPost[],
      posting: [] as ScheduledPost[],
      failed: [] as ScheduledPost[],
      posted: [] as ScheduledPost[]
    };
    for (const post of records) {
      if (post.status === "DRAFT") queue.drafts.push(post);
      else if (post.status === "SCHEDULED") queue.scheduled.push(post);
      else if (post.status === "POSTING") queue.posting.push(post);
      else if (post.status === "FAILED") queue.failed.push(post);
      else if (post.status === "POSTED") queue.posted.push(post);
    }
    queue.scheduled.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
    return queue;
  }

  // Approve a draft → it joins the queue and the worker will publish it.
  async scheduleDraft(
    id: string,
    xAccountId: string,
    scheduledAt: Date,
    timezone: string
  ) {
    await this.prisma.scheduledPost.updateMany({
      where: { id, xAccountId, status: "DRAFT" },
      data: { status: "SCHEDULED", scheduledAt, timezone }
    });
    return this.prisma.scheduledPost.findFirst({ where: { id, xAccountId } });
  }

  async deleteDraft(id: string, xAccountId: string) {
    await this.prisma.scheduledPost.deleteMany({
      where: { id, xAccountId, status: "DRAFT" }
    });
    return { ok: true };
  }

  async cancel(id: string, xAccountId: string) {
    return this.prisma.scheduledPost.updateMany({
      where: { id, xAccountId, status: "SCHEDULED" },
      data: { status: "CANCELED" }
    });
  }

  // A retry reuses the exact approved record (including attached assets) so a
  // transient X failure never turns into a duplicate post or a new draft.
  async retry(id: string, xAccountId: string) {
    const retriedAt = new Date();
    const result = await this.prisma.scheduledPost.updateMany({
      where: { id, xAccountId, status: "FAILED" },
      data: {
        status: "SCHEDULED",
        scheduledAt: retriedAt,
        errorCode: null,
        errorMessage: null
      }
    });
    if (result.count === 0) {
      throw new Error("Only a failed post can be retried.");
    }
    return this.prisma.scheduledPost.findFirstOrThrow({ where: { id, xAccountId } });
  }

  async publishDue(now = new Date()) {
    const due = await this.prisma.scheduledPost.findMany({
      where: { status: "SCHEDULED", scheduledAt: { lte: now } },
      include: { xAccount: true },
      take: 25,
      orderBy: { scheduledAt: "asc" }
    });

    for (const scheduled of due) {
      await this.publishOne(scheduled);
    }
  }

  private async publishOne(scheduled: ScheduledPost & { xAccount: XAccount }) {
    await this.prisma.scheduledPost.update({
      where: { id: scheduled.id },
      data: { status: "POSTING" }
    });

    try {
      const threadParts = readThreadParts(scheduled.threadParts);
      const result = await this.composer.publishNow({
        xAccount: scheduled.xAccount,
        text: scheduled.text ?? undefined,
        quotePostId: scheduled.quotePostId ?? undefined,
        replyToPostId: scheduled.replyToPostId ?? undefined,
        mediaAssetIds: readMediaAssetIds(scheduled.media),
        mediaIds: readMediaIds(scheduled.media),
        threadParts
      });

      const postedXPostId = Array.isArray(result) ? result.at(-1)?.id : result?.id;
      await this.prisma.scheduledPost.update({
        where: { id: scheduled.id },
        data: { status: "POSTED", postedXPostId }
      });
    } catch (error) {
      await this.prisma.scheduledPost.update({
        where: { id: scheduled.id },
        data: {
          status: "FAILED",
          errorMessage: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }
}

function readThreadParts(value: unknown): string[] | undefined {
  if (!value || typeof value !== "object" || !("parts" in value)) return undefined;
  const parts = (value as { parts?: unknown }).parts;
  return Array.isArray(parts) ? parts.filter((part): part is string => typeof part === "string") : undefined;
}

function readMediaIds(value: unknown): string[] | undefined {
  if (!value || typeof value !== "object" || !("mediaIds" in value)) return undefined;
  const mediaIds = (value as { mediaIds?: unknown }).mediaIds;
  return Array.isArray(mediaIds) ? mediaIds.filter((id): id is string => typeof id === "string") : undefined;
}

function readMediaAssetIds(value: unknown): string[] | undefined {
  if (!value || typeof value !== "object" || !("assetIds" in value)) return undefined;
  const assetIds = (value as { assetIds?: unknown }).assetIds;
  return Array.isArray(assetIds) ? assetIds.filter((id): id is string => typeof id === "string") : undefined;
}
