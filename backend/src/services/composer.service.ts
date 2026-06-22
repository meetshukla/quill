import type { PrismaClient, XAccount } from "@prisma/client";
import { randomIdempotencySeed } from "../lib/idempotency.js";
import { XClientService } from "./x-client.service.js";

export type ComposerPostInput = {
  xAccount: XAccount;
  text?: string;
  quotePostId?: string;
  replyToPostId?: string;
  mediaIds?: string[];
  threadParts?: string[];
};

export class ComposerService {
  private readonly xClient: XClientService;

  constructor(private readonly prisma: PrismaClient) {
    this.xClient = new XClientService(prisma);
  }

  async publishNow(input: ComposerPostInput) {
    this.assertWriteEnabled(input.xAccount);
    if (input.threadParts?.length) return this.publishThread(input);
    const response = await this.xClient.createPost(input.xAccount, this.toXPostBody(input));
    return response.data;
  }

  async createScheduledPost(input: ComposerPostInput & { scheduledAt: Date; timezone: string }) {
    this.assertWriteEnabled(input.xAccount);
    return this.prisma.scheduledPost.create({
      data: {
        xAccountId: input.xAccount.id,
        text: input.text,
        threadParts: input.threadParts ? { parts: input.threadParts } : undefined,
        quotePostId: input.quotePostId,
        replyToPostId: input.replyToPostId,
        media: input.mediaIds ? { mediaIds: input.mediaIds } : undefined,
        scheduledAt: input.scheduledAt,
        timezone: input.timezone,
        idempotencyKey: randomIdempotencySeed("scheduled_post")
      }
    });
  }

  // A draft is a post the agent proposed but the user hasn't approved yet.
  // It never publishes (the worker only picks up SCHEDULED). scheduledAt is a
  // suggested time the user can change when approving.
  async createDraft(
    input: ComposerPostInput & { scheduledAt?: Date; timezone?: string }
  ) {
    return this.prisma.scheduledPost.create({
      data: {
        xAccountId: input.xAccount.id,
        status: "DRAFT",
        text: input.text,
        threadParts: input.threadParts ? { parts: input.threadParts } : undefined,
        quotePostId: input.quotePostId,
        replyToPostId: input.replyToPostId,
        media: input.mediaIds ? { mediaIds: input.mediaIds } : undefined,
        scheduledAt: input.scheduledAt ?? new Date(),
        timezone: input.timezone ?? "UTC",
        idempotencyKey: randomIdempotencySeed("draft")
      }
    });
  }

  async quotePreview(xAccount: XAccount, postId: string) {
    const response = await this.xClient.lookupPosts(xAccount, [postId], false);
    return response.data?.[0] ?? null;
  }

  private async publishThread(input: ComposerPostInput) {
    const parts = input.threadParts ?? [];
    if (parts.length === 0) throw new Error("Thread requires at least one part");
    let replyToPostId = input.replyToPostId;
    const posted: Array<{ id: string; text: string }> = [];

    for (const [index, part] of parts.entries()) {
      const response = await this.xClient.createPost(input.xAccount, {
        text: part,
        quote_tweet_id: index === 0 ? input.quotePostId : undefined,
        reply: replyToPostId ? { in_reply_to_tweet_id: replyToPostId } : undefined,
        media: index === 0 && input.mediaIds?.length ? { media_ids: input.mediaIds } : undefined
      });
      if (!response.data) throw new Error("X did not return created thread post");
      posted.push(response.data);
      replyToPostId = response.data.id;
    }

    return posted;
  }

  private toXPostBody(input: ComposerPostInput) {
    if (!input.text && !input.mediaIds?.length) throw new Error("Post requires text or media");
    return {
      text: input.text,
      quote_tweet_id: input.quotePostId,
      reply: input.replyToPostId ? { in_reply_to_tweet_id: input.replyToPostId } : undefined,
      media: input.mediaIds?.length ? { media_ids: input.mediaIds } : undefined
    };
  }

  private assertWriteEnabled(xAccount: XAccount) {
    if (!xAccount.writeEnabled) {
      throw new Error("Connected X account does not have tweet.write permission");
    }
  }
}

