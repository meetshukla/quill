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

  async cancel(id: string, xAccountId: string) {
    return this.prisma.scheduledPost.updateMany({
      where: { id, xAccountId, status: "SCHEDULED" },
      data: { status: "CANCELED" }
    });
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
