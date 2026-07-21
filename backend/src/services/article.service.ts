import type { Prisma, PrismaClient, ScheduledArticle, XAccount } from "@prisma/client";
import { MediaAssetService } from "./media-asset.service.js";
import { XClientService } from "./x-client.service.js";

type ContentState = { blocks: unknown[]; entities: unknown[] };

export class ArticleService {
  private readonly xClient: XClientService;
  private readonly media: MediaAssetService;

  constructor(private readonly prisma: PrismaClient) {
    this.xClient = new XClientService(prisma);
    this.media = new MediaAssetService(prisma);
  }

  async createDraft(input: { xAccount: XAccount; title: string; contentState: ContentState; coverAssetId?: string }) {
    this.assertWriteEnabled(input.xAccount);
    assertContentState(input.contentState);
    return this.prisma.scheduledArticle.create({
      data: {
        xAccountId: input.xAccount.id,
        title: input.title,
        contentState: input.contentState as Prisma.InputJsonValue,
        coverAssetId: input.coverAssetId
      }
    });
  }

  async list(xAccountId: string) {
    return this.prisma.scheduledArticle.findMany({ where: { xAccountId }, orderBy: { updatedAt: "desc" } });
  }

  // Creating this X draft is the review gate. Re-reviewing creates a fresh X
  // draft so edits never alter a draft already approved for a future schedule.
  async createXDraft(id: string, xAccount: XAccount) {
    const article = await this.requireDraft(id, xAccount.id);
    const material = await this.media.uploadForArticle(xAccount, referencedAssetIds(article));
    const byAssetId = new Map(material.map((item) => [item.assetId, item]));
    const contentState = materializeContentState(article.contentState, byAssetId);
    const cover = article.coverAssetId ? byAssetId.get(article.coverAssetId) : undefined;
    if (article.coverAssetId && !cover) throw new Error("The article cover asset is not available");
    const response = await this.xClient.createArticleDraft(xAccount, {
      title: article.title,
      content_state: contentState,
      ...(cover ? { cover_media: { media_category: cover.mediaCategory, media_id: cover.mediaId } } : {})
    });
    const xArticleId = response.data?.id;
    if (!xArticleId) throw new Error("X did not return an Article draft ID");
    return this.prisma.scheduledArticle.update({
      where: { id: article.id },
      data: { xArticleId, reviewUrl: `https://x.com/i/article/${xArticleId}`, status: "REVIEW" }
    });
  }

  async schedule(id: string, xAccountId: string, scheduledAt: Date, timezone: string) {
    const article = await this.requireDraft(id, xAccountId);
    if (!article.xArticleId || article.status !== "REVIEW") {
      throw new Error("Create and review the X Article draft before scheduling it");
    }
    return this.prisma.scheduledArticle.update({
      where: { id: article.id },
      data: { status: "SCHEDULED", scheduledAt, timezone, errorMessage: null }
    });
  }

  async publishDue(now = new Date()) {
    const due = await this.prisma.scheduledArticle.findMany({
      where: { status: "SCHEDULED", scheduledAt: { lte: now } },
      include: { xAccount: true },
      take: 25,
      orderBy: { scheduledAt: "asc" }
    });
    for (const article of due) await this.publishOne(article);
  }

  private async publishOne(article: ScheduledArticle & { xAccount: XAccount }) {
    if (!article.xArticleId) return;
    await this.prisma.scheduledArticle.update({ where: { id: article.id }, data: { status: "PUBLISHING" } });
    try {
      const result = await this.xClient.publishArticle(article.xAccount, article.xArticleId);
      const postId = result.data?.post_id;
      if (!postId) throw new Error("X did not return the Article's published post ID");
      await this.prisma.scheduledArticle.update({
        where: { id: article.id }, data: { status: "PUBLISHED", publishedXPostId: postId }
      });
    } catch (error) {
      await this.prisma.scheduledArticle.update({
        where: { id: article.id },
        data: { status: "FAILED", errorMessage: error instanceof Error ? error.message : String(error) }
      });
    }
  }

  private async requireDraft(id: string, xAccountId: string) {
    const article = await this.prisma.scheduledArticle.findFirst({ where: { id, xAccountId } });
    if (!article) throw new Error("Article draft not found");
    return article;
  }

  private assertWriteEnabled(xAccount: XAccount) {
    if (!xAccount.writeEnabled) throw new Error("Connected X account does not have tweet.write permission");
  }
}

export function assertContentState(value: ContentState) {
  if (!Array.isArray(value.blocks) || !Array.isArray(value.entities) || !value.blocks.length) {
    throw new Error("An X Article needs a DraftJS content state with at least one block");
  }
}

function referencedAssetIds(article: ScheduledArticle) {
  const ids = new Set<string>(article.coverAssetId ? [article.coverAssetId] : []);
  const entities = (article.contentState as ContentState).entities;
  for (const entity of entities) {
    if (!entity || typeof entity !== "object") continue;
    const data = (entity as { value?: { data?: { asset_ids?: unknown } } }).value?.data;
    if (Array.isArray(data?.asset_ids)) data.asset_ids.forEach((id) => { if (typeof id === "string") ids.add(id); });
  }
  return [...ids];
}

function materializeContentState(value: unknown, assets: Map<string, { mediaId: string; mediaCategory: string }>) {
  const state = structuredClone(value) as ContentState;
  state.entities = state.entities.map((entity) => {
    if (!entity || typeof entity !== "object") return entity;
    const valueObject = (entity as { value?: { data?: Record<string, unknown> } }).value;
    const data = valueObject?.data;
    const assetIds = data?.asset_ids;
    if (!data || !Array.isArray(assetIds)) return entity;
    const mediaItems = assetIds.map((id) => {
      if (typeof id !== "string" || !assets.has(id)) throw new Error("An article media asset is missing");
      const asset = assets.get(id)!;
      return { media_category: asset.mediaCategory, media_id: asset.mediaId };
    });
    delete data.asset_ids;
    data.media_items = mediaItems;
    return entity;
  });
  return state;
}
