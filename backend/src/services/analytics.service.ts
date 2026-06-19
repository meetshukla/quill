import type { PostType, Prisma, PrismaClient, XAccount } from "@prisma/client";
import { env } from "../config/env.js";
import { addDays, subDays } from "../lib/time.js";
import type { XPost } from "../types/x.js";
import { XClientService } from "./x-client.service.js";
import { XUsageService } from "./x-usage.service.js";

export class AnalyticsService {
  private readonly xClient: XClientService;
  private readonly usage: XUsageService;

  constructor(private readonly prisma: PrismaClient) {
    this.xClient = new XClientService(prisma);
    this.usage = new XUsageService(prisma);
  }

  async syncLastSevenDays(xAccount: XAccount) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: xAccount.userId } });
    if (!user.analyticsEnabled) return { skipped: "analytics_disabled" };
    await this.enforceOwnedReadBudget(xAccount);

    const windowDays = Math.min(user.analyticsWindowDays, env.ANALYTICS_WINDOW_DAYS, 7);
    const since = subDays(new Date(), windowDays);
    const response = await this.xClient.listOwnedPosts({
      xAccount,
      maxResults: Math.min(env.ANALYTICS_MAX_POSTS, 100)
    });

    const posts = (response.data ?? []).filter((post) => {
      return post.created_at ? new Date(post.created_at) >= since : true;
    });

    for (const post of posts) {
      await this.upsertPost(xAccount.id, post, user.analyticsRetentionDays);
    }

    await this.prisma.xAccount.update({
      where: { id: xAccount.id },
      data: { analyticsLastSyncedAt: new Date(), lastSyncedAt: new Date() }
    });

    return { synced: posts.length };
  }

  async getSummary(xAccountId: string) {
    const posts = await this.prisma.post.findMany({
      where: { xAccountId, expiresAt: { gt: new Date() } }
    });
    const views = sum(posts.map((post) => post.views));
    const likes = sum(posts.map((post) => post.likes));
    const reposts = sum(posts.map((post) => post.reposts));
    const replies = sum(posts.map((post) => post.replies));
    const bookmarks = sum(posts.map((post) => post.bookmarks));
    return {
      posts: posts.length,
      views,
      likes,
      reposts,
      replies,
      bookmarks,
      engagementRate: views > 0 ? (likes + reposts + replies + bookmarks) / views : null
    };
  }

  private async upsertPost(xAccountId: string, post: XPost, retentionDays: number) {
    const metrics = post.public_metrics ?? post.organic_metrics ?? post.non_public_metrics ?? {};
    const views = metrics.impression_count;
    const likes = metrics.like_count;
    const reposts = metrics.retweet_count;
    const replies = metrics.reply_count;
    const bookmarks = metrics.bookmark_count;
    const engagementRate =
      views && views > 0 ? ((likes ?? 0) + (reposts ?? 0) + (replies ?? 0) + (bookmarks ?? 0)) / views : null;

    await this.prisma.post.upsert({
      where: { xAccountId_xPostId: { xAccountId, xPostId: post.id } },
      create: {
        xAccountId,
        xPostId: post.id,
        text: post.text,
        createdAtX: post.created_at ? new Date(post.created_at) : new Date(),
        postType: inferPostType(post),
        conversationId: post.conversation_id,
        inReplyToUserId: post.in_reply_to_user_id,
        referencedTweets: toJson(post.referenced_tweets),
        attachments: toJson(post.attachments),
        entities: toJson(post.entities),
        publicMetrics: toJson(post.public_metrics),
        organicMetrics: toJson(post.organic_metrics),
        nonPublicMetrics: toJson(post.non_public_metrics),
        views,
        likes,
        reposts,
        replies,
        bookmarks,
        engagementRate,
        lastMetricsSyncedAt: new Date(),
        rawX: toJson(post),
        expiresAt: addDays(new Date(), retentionDays)
      },
      update: {
        text: post.text,
        publicMetrics: toJson(post.public_metrics),
        organicMetrics: toJson(post.organic_metrics),
        nonPublicMetrics: toJson(post.non_public_metrics),
        views,
        likes,
        reposts,
        replies,
        bookmarks,
        engagementRate,
        lastMetricsSyncedAt: new Date(),
        rawX: toJson(post),
        expiresAt: addDays(new Date(), retentionDays)
      }
    });
  }

  private async enforceOwnedReadBudget(xAccount: XAccount) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: xAccount.userId } });
    const daily = await this.usage.getDailyOwnedReadUsage(xAccount.id);
    const monthly = await this.usage.getMonthlyOwnedReadUsage(xAccount.id);
    if (daily >= user.dailyOwnedReadHardLimit) throw new Error("Daily owned-read hard limit reached");
    if (monthly >= user.monthlyOwnedReadBudget) throw new Error("Monthly owned-read budget reached");
  }
}

function inferPostType(post: XPost): PostType {
  const ref = post.referenced_tweets?.[0]?.type;
  if (ref === "replied_to") return "REPLY";
  if (ref === "quoted") return "QUOTE";
  if (ref === "retweeted") return "REPOST";
  return "ORIGINAL";
}

function sum(values: Array<number | null | undefined>) {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

// X payload fields are loosely typed (Record<string, unknown>); Prisma's JSON
// inputs want InputJsonValue. Normalize null/undefined and cast for storage.
function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined || value === null
    ? undefined
    : (value as Prisma.InputJsonValue);
}

