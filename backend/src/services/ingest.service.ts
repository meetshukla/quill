import type { Prisma, PrismaClient, XAccount } from "@prisma/client";
import type { XPost } from "../types/x.js";
import { XClientService } from "./x-client.service.js";

const MAX_API_HISTORY = 3200; // hard cap the X timeline endpoint allows

// Pulls a person's recent posts (including replies) and stores them, resolving
// each reply/quote's parent post so the agent can learn voice in context.
export class IngestService {
  private readonly x: XClientService;

  constructor(private readonly prisma: PrismaClient) {
    this.x = new XClientService(prisma);
  }

  async syncOwnPosts(
    xAccount: XAccount,
    opts: { max?: number; full?: boolean } = {}
  ) {
    const target = Math.min(opts.max ?? 800, MAX_API_HISTORY);

    // Incremental by default: only fetch tweets newer than the newest we've
    // already stored. A full backfill is opt-in. X ids are time-ordered, so
    // the newest stored id is a reliable `since_id`.
    let sinceId: string | undefined;
    if (!opts.full) {
      const newest = await this.prisma.post.findFirst({
        where: { xAccountId: xAccount.id },
        orderBy: { createdAtX: "desc" },
        select: { xPostId: true }
      });
      sinceId = newest?.xPostId;
    }
    const mode = sinceId ? "incremental" : "full";

    let token: string | undefined;
    let synced = 0;
    let withParents = 0;
    const seen = new Set<string>();

    while (synced < target) {
      const res = await this.x.listOwnedPosts({
        xAccount,
        maxResults: Math.min(100, target - synced),
        paginationToken: token,
        sinceId,
        withReferenced: true
      });
      const tweets = res.data ?? [];
      if (tweets.length === 0) break;

      const referenced = (res.includes as { tweets?: XPost[] } | undefined)?.tweets ?? [];
      const parentMap = new Map(referenced.map((t) => [t.id, t]));

      for (const tweet of tweets) {
        if (seen.has(tweet.id)) continue;
        seen.add(tweet.id);
        const ref = tweet.referenced_tweets?.find(
          (r) => r.type === "replied_to" || r.type === "quoted"
        );
        const parent = ref ? parentMap.get(ref.id) : undefined;
        if (parent) withParents += 1;
        await this.upsert(xAccount.id, tweet, parent, ref?.type);
        synced += 1;
        if (synced >= target) break;
      }

      token = res.meta?.next_token;
      if (!token) break;
    }

    await this.prisma.xAccount.update({
      where: { id: xAccount.id },
      data: { lastSyncedAt: new Date() }
    });

    return { synced, withParents, mode };
  }

  // Flat list shaped for voice analysis: the user's post + the post it replied
  // to (or quoted), so the agent sees how they write in context.
  async listForVoice(xAccountId: string, limit = 800) {
    const posts = await this.prisma.post.findMany({
      where: { xAccountId },
      orderBy: { createdAtX: "desc" },
      take: Math.min(limit, MAX_API_HISTORY)
    });
    return posts.map((p) => {
      const ref = p.referencedTweets as
        | { parent?: { text?: string; type?: string } }
        | null;
      return {
        id: p.xPostId,
        text: p.text,
        type: p.postType,
        createdAt: p.createdAtX,
        inReplyTo: ref?.parent?.type === "replied_to" ? ref.parent.text ?? null : null,
        quotes: ref?.parent?.type === "quoted" ? ref.parent.text ?? null : null
      };
    });
  }

  private async upsert(
    xAccountId: string,
    tweet: XPost,
    parent: XPost | undefined,
    refType: string | undefined
  ) {
    const postType = tweet.referenced_tweets?.some((r) => r.type === "replied_to")
      ? "REPLY"
      : tweet.referenced_tweets?.some((r) => r.type === "quoted")
        ? "QUOTE"
        : "ORIGINAL";

    const referencedTweets = parent
      ? { parent: { id: parent.id, text: parent.text, type: refType } }
      : undefined;

    await this.prisma.post.upsert({
      where: { xAccountId_xPostId: { xAccountId, xPostId: tweet.id } },
      create: {
        xAccountId,
        xPostId: tweet.id,
        text: tweet.text,
        createdAtX: tweet.created_at ? new Date(tweet.created_at) : new Date(),
        postType,
        conversationId: tweet.conversation_id,
        inReplyToUserId: tweet.in_reply_to_user_id,
        referencedTweets: referencedTweets as Prisma.InputJsonValue | undefined,
        rawX: tweet as unknown as Prisma.InputJsonValue
      },
      update: {
        text: tweet.text,
        postType,
        referencedTweets: referencedTweets as Prisma.InputJsonValue | undefined
      }
    });
  }
}
