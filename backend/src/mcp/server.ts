import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PrismaClient, XAccount } from "@prisma/client";
import { z } from "zod";
import { decodeResearchCursor } from "../lib/research-cursor.js";
import { ArticleService } from "../services/article.service.js";
import { ComposerService } from "../services/composer.service.js";
import { CtaService } from "../services/cta.service.js";
import { IngestService } from "../services/ingest.service.js";
import { MediaAssetService } from "../services/media-asset.service.js";
import { RepostService } from "../services/repost.service.js";
import { ResearchService } from "../services/research.service.js";
import { ScheduleService } from "../services/schedule.service.js";

const contentStateSchema = z.object({
  blocks: z.array(z.unknown()).min(1),
  entities: z.array(z.unknown())
});

const postInput = {
  text: z.string().trim().min(1).max(25_000).optional(),
  quotePostId: z.string().min(1).optional(),
  replyToPostId: z.string().min(1).optional(),
  mediaAssetIds: z.array(z.string().uuid()).max(4).optional(),
  threadParts: z.array(z.string().trim().min(1).max(25_000)).min(2).max(25).optional()
};

const itemStatus = z.enum(["NEW", "KEPT", "JUNK", "REPLY_READY", "USED", "ARCHIVED"]);
const itemType = z.enum(["POST", "THREAD", "PROFILE", "ARTICLE", "NOTE"]);

type McpContext = {
  prisma: PrismaClient;
  userId: string;
};

function textResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : "Quill could not complete that request";
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

async function call<T>(operation: () => Promise<T>) {
  try {
    return textResult(await operation());
  } catch (error) {
    return errorResult(error);
  }
}

function profile(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "profile" in value && typeof value.profile === "string") {
    return value.profile;
  }
  return "";
}

async function accountFor({ prisma, userId }: McpContext): Promise<XAccount> {
  const account = await prisma.xAccount.findUnique({ where: { userId } });
  if (!account) throw new Error("Add an X API connection in Quill Settings before using this tool");
  return account;
}

/**
 * The deployed, stateless Quill MCP server. All tools close over one resolved
 * Quill user, so one founder cannot read, write, or schedule another person's
 * account. Scheduling is deliberately review-first: there is no publish-now
 * MCP tool.
 */
export function buildQuillMcpServer(context: McpContext) {
  const { prisma, userId } = context;
  const composer = new ComposerService(prisma);
  const scheduler = new ScheduleService(prisma);
  const articles = new ArticleService(prisma);
  const media = new MediaAssetService(prisma);
  const research = new ResearchService(prisma);
  const ingest = new IngestService(prisma);
  const cta = new CtaService(prisma);
  const repost = new RepostService(prisma);

  const server = new McpServer(
    { name: "quill", version: "1.0.0" },
    {
      instructions: [
        "Quill is a private X writing and scheduling system for the authenticated person.",
        "Call get_quill_status first.",
        "Never publish directly: create drafts, let the human review the exact text and time, then schedule only after explicit approval.",
        "Article workflow is create_article_draft, create_article_review, human reviews the returned X URL, then schedule_article after approval.",
        "The account's writing and reply profiles are private instructions. Use them for drafting; do not quote or expose them in public copy."
      ].join(" ")
    }
  );

  server.registerTool(
    "get_quill_status",
    {
      description: "Return the authenticated Quill account, connected X account, active queue counts, and total captured research count. Call this first.",
      annotations: { title: "Get Quill status", readOnlyHint: true, openWorldHint: false }
    },
    () => call(async () => {
      const [user, account] = await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, name: true } }),
        prisma.xAccount.findUnique({ where: { userId }, select: { id: true, username: true, displayName: true, writeEnabled: true, lastSyncedAt: true } })
      ]);
      const counts = account ? await Promise.all([
        prisma.scheduledPost.count({ where: { xAccountId: account.id, status: "DRAFT" } }),
        prisma.scheduledPost.count({ where: { xAccountId: account.id, status: "SCHEDULED" } }),
        prisma.scheduledArticle.count({ where: { xAccountId: account.id, status: { in: ["DRAFT", "REVIEW", "SCHEDULED"] } } }),
        prisma.researchItem.count({ where: { userId, status: { not: "ARCHIVED" } } }),
        prisma.researchItem.count({ where: { userId } })
      ]) : [0, 0, 0, 0, 0];
      return {
        user,
        account,
        counts: {
          drafts: counts[0],
          scheduledPosts: counts[1],
          activeArticles: counts[2],
          researchItems: counts[3],
          researchCorpusItems: counts[4]
        }
      };
    })
  );

  server.registerTool(
    "get_profiles",
    {
      description: "Read the authenticated person's private writing and reply profiles. Use the writing profile for posts/articles and the reply profile for X replies.",
      annotations: { title: "Get writing profiles", readOnlyHint: true, openWorldHint: false }
    },
    () => call(async () => {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { writingProfile: true, replyProfile: true } });
      return { writingProfile: profile(user.writingProfile), replyProfile: profile(user.replyProfile) };
    })
  );

  server.registerTool(
    "update_profile",
    {
      description: "Replace one private Quill profile. Only call when the human explicitly provides or approves the new profile; never overwrite a profile based only on old posts.",
      inputSchema: {
        kind: z.enum(["writing", "reply"]).describe("The profile to change."),
        profile: z.string().trim().min(40).max(20_000).describe("The approved private profile text.")
      },
      annotations: { title: "Update profile", readOnlyHint: false, idempotentHint: true, openWorldHint: false }
    },
    ({ kind, profile: profileText }) => call(async () => {
      await prisma.user.update({
        where: { id: userId },
        data: kind === "writing" ? { writingProfile: { profile: profileText } } : { replyProfile: { profile: profileText } }
      });
      return { ok: true, updated: kind };
    })
  );

  server.registerTool(
    "sync_owned_posts",
    {
      description: "Incrementally pull the authenticated person's recent X posts into Quill. This may consume X owned-read budget; do not request full sync unless the human asks for a backfill.",
      inputSchema: {
        max: z.number().int().min(1).max(3200).optional().describe("Maximum posts to consider; default 800."),
        full: z.boolean().optional().describe("Force a historical backfill only when explicitly requested. Default false.")
      },
      annotations: { title: "Sync owned X posts", readOnlyHint: false, openWorldHint: true }
    },
    ({ max = 800, full = false }) => call(async () => ingest.syncOwnPosts(await accountFor(context), { max, full }))
  );

  server.registerTool(
    "list_owned_posts",
    {
      description: "Read stored posts from the authenticated X account, including reply/quote context where available.",
      inputSchema: { limit: z.number().int().min(1).max(3200).optional() },
      annotations: { title: "List owned posts", readOnlyHint: true, openWorldHint: false }
    },
    ({ limit = 100 }) => call(async () => ({ posts: await ingest.listForVoice((await accountFor(context)).id, limit) }))
  );

  server.registerTool(
    "search_research",
    {
      description: "Read one cursor-paginated page of the person's captured research corpus. Follow nextCursor until null; never assume a page is the complete corpus.",
      inputSchema: {
        status: itemStatus.optional(),
        includeArchived: z.boolean().optional().describe("Include archived captures. Defaults to true for the complete research corpus; set false for the active queue."),
        type: itemType.optional(),
        sourceHandle: z.string().min(1).max(100).optional(),
        capturedAfter: z.string().datetime().optional(),
        capturedBefore: z.string().datetime().optional(),
        cursor: z.string().min(1).max(500).optional(),
        limit: z.number().int().min(1).max(500).optional()
      },
      annotations: { title: "Search research", readOnlyHint: true, openWorldHint: false }
    },
    (input) => call(async () => research.readPage(userId, {
      ...input,
      includeArchived: input.includeArchived ?? true,
      capturedAfter: input.capturedAfter ? new Date(input.capturedAfter) : undefined,
      capturedBefore: input.capturedBefore ? new Date(input.capturedBefore) : undefined,
      cursor: input.cursor ? decodeResearchCursor(input.cursor) : undefined,
      limit: input.limit ?? 100
    }))
  );

  server.registerTool(
    "get_research_index",
    {
      description: "Return an index of the complete captured research corpus by source and type, including archived records by default. Set includeArchived false for active-only queue counts.",
      inputSchema: {
        includeArchived: z.boolean().optional().describe("Include archived captures; defaults to true for the complete corpus."),
        type: itemType.optional(),
        sourceHandle: z.string().min(1).max(100).optional()
      },
      annotations: { title: "Get research index", readOnlyHint: true, openWorldHint: false }
    },
    (input) => call(async () => research.index(userId, { ...input, includeArchived: input.includeArchived ?? true }))
  );

  server.registerTool(
    "capture_research",
    {
      description: "Save one or more already-obtained X posts, articles, profiles, or notes to this person's private research corpus. Preserve the source URL and media metadata; do not scrape or fabricate missing source data.",
      inputSchema: {
        items: z.array(z.object({
          type: itemType.default("POST"),
          url: z.string().url(),
          xPostId: z.string().min(1).optional(),
          sourceHandle: z.string().max(100).optional(),
          authorName: z.string().max(200).optional(),
          title: z.string().max(500).optional(),
          text: z.string().max(100_000).optional(),
          raw: z.unknown().optional(),
          matchedKeywords: z.array(z.string().min(1).max(100)).max(100).optional()
        })).min(1).max(200)
      },
      annotations: { title: "Capture research", readOnlyHint: false, openWorldHint: true }
    },
    ({ items }) => call(async () => ({ items: await research.captureBulk(userId, items) }))
  );

  server.registerTool(
    "list_research_rules",
    {
      description: "List the active keyword match, exclusion, and priority rules used by the Quill browser companion.",
      annotations: { title: "List research rules", readOnlyHint: true, openWorldHint: false }
    },
    () => call(async () => ({ rules: await research.listRules(userId) }))
  );

  server.registerTool(
    "save_research_rule",
    {
      description: "Add or re-enable one keyword rule for the authenticated person's explicit manual scans.",
      inputSchema: { kind: z.enum(["MATCH", "EXCLUDE", "PRIORITY"]), value: z.string().trim().min(1).max(120) },
      annotations: { title: "Save research rule", readOnlyHint: false, idempotentHint: true, openWorldHint: false }
    },
    (input) => call(async () => ({ rule: await research.saveRule(userId, input) }))
  );

  server.registerTool(
    "prepare_replies",
    {
      description: "Generate copy-only replies for captured research using the private reply profile. It never posts to X. Use only when a natural, source-specific reply is possible.",
      inputSchema: { limit: z.number().int().min(1).max(20).optional() },
      annotations: { title: "Prepare replies", readOnlyHint: false, openWorldHint: false }
    },
    ({ limit = 5 }) => call(async () => research.prepareReplies(userId, limit))
  );

  server.registerTool(
    "get_next_replies",
    {
      description: "Get ready-to-copy replies from the queue and their exact original X URLs. This does not post anything.",
      inputSchema: { limit: z.number().int().min(1).max(10).optional() },
      annotations: { title: "Get reply queue", readOnlyHint: true, openWorldHint: false }
    },
    ({ limit = 5 }) => call(async () => ({ items: await research.nextReady(userId, limit) }))
  );

  server.registerTool(
    "list_media_assets",
    {
      description: "List the authenticated X account's durable uploaded image and video assets, ready to attach to a draft or X Article.",
      annotations: { title: "List media assets", readOnlyHint: true, openWorldHint: false }
    },
    () => call(async () => ({ assets: await media.list((await accountFor(context)).id) }))
  );

  server.registerTool(
    "upload_media_asset",
    {
      description: "Store an owned JPEG, PNG, WebP, GIF, MP4, or MOV asset in Quill. Pass base64 bytes. Quill uploads it to X only when its human-approved draft/article is reviewed or published.",
      inputSchema: {
        filename: z.string().trim().min(1).max(160),
        contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/quicktime"]),
        dataBase64: z.string().min(4).max(720_000_000).describe("Raw file bytes base64 encoded; do not include a data URL prefix.")
      },
      annotations: { title: "Upload media", readOnlyHint: false, openWorldHint: false }
    },
    ({ filename, contentType, dataBase64 }) => call(async () => {
      const bytes = Buffer.from(dataBase64, "base64");
      if (!bytes.length) throw new Error("dataBase64 did not contain a media file");
      return { asset: await media.create((await accountFor(context)).id, { filename, contentType, bytes }) };
    })
  );

  server.registerTool(
    "delete_media_asset",
    {
      description: "Delete an unreferenced media asset. Quill refuses deletion when an asset is attached to a draft, schedule, or Article.",
      inputSchema: { assetId: z.string().uuid() },
      annotations: { title: "Delete media", readOnlyHint: false, destructiveHint: true, openWorldHint: false }
    },
    ({ assetId }) => call(async () => media.remove(assetId, (await accountFor(context)).id))
  );

  server.registerTool(
    "create_draft",
    {
      description: "Create a private post, reply, quote, media post, or thread draft. This never publishes. Use mediaAssetIds for owned media stored through Quill.",
      inputSchema: postInput,
      annotations: { title: "Create X draft", readOnlyHint: false, openWorldHint: false }
    },
    (input) => call(async () => ({ draft: await composer.createDraft({ xAccount: await accountFor(context), ...input }) }))
  );

  server.registerTool(
    "list_drafts",
    {
      description: "List private drafts awaiting human approval.",
      annotations: { title: "List drafts", readOnlyHint: true, openWorldHint: false }
    },
    () => call(async () => ({ drafts: await scheduler.listDrafts((await accountFor(context)).id) }))
  );

  server.registerTool(
    "schedule_draft",
    {
      description: "Approve and schedule an existing draft. Call only after the human explicitly approved that exact draft text, media, date, time, and timezone. The Quill worker publishes it later.",
      inputSchema: {
        draftId: z.string().uuid(),
        scheduledAt: z.string().datetime().describe("UTC ISO 8601 timestamp, for example 2026-07-22T13:30:00.000Z."),
        timezone: z.string().min(1).max(100).describe("Human timezone, for example America/Toronto.")
      },
      annotations: { title: "Schedule approved draft", readOnlyHint: false, openWorldHint: false }
    },
    ({ draftId, scheduledAt, timezone }) => call(async () => ({
      scheduledPost: await scheduler.scheduleDraft(draftId, (await accountFor(context)).id, new Date(scheduledAt), timezone)
    }))
  );

  server.registerTool(
    "discard_draft",
    {
      description: "Permanently discard a private unapproved draft. Only call when the human asks to remove it.",
      inputSchema: { draftId: z.string().uuid() },
      annotations: { title: "Discard draft", readOnlyHint: false, destructiveHint: true, openWorldHint: false }
    },
    ({ draftId }) => call(async () => scheduler.deleteDraft(draftId, (await accountFor(context)).id))
  );

  server.registerTool(
    "list_scheduled_posts",
    {
      description: "List future scheduled X posts. The Quill worker, not this MCP connection, publishes them at their scheduled time.",
      annotations: { title: "List scheduled posts", readOnlyHint: true, openWorldHint: false }
    },
    () => call(async () => ({ scheduledPosts: await scheduler.listScheduled((await accountFor(context)).id) }))
  );

  server.registerTool(
    "cancel_scheduled_post",
    {
      description: "Cancel a future scheduled post before Quill's worker publishes it.",
      inputSchema: { scheduledPostId: z.string().uuid() },
      annotations: { title: "Cancel scheduled post", readOnlyHint: false, destructiveHint: true, openWorldHint: false }
    },
    ({ scheduledPostId }) => call(async () => ({
      scheduledPost: await scheduler.cancel(scheduledPostId, (await accountFor(context)).id)
    }))
  );

  server.registerTool(
    "create_article_draft",
    {
      description: "Create a private native X Article in Quill. contentState is X DraftJS state. Use media asset IDs inside entity value.data.asset_ids, then call create_article_review to materialize a private X draft.",
      inputSchema: {
        title: z.string().trim().min(1).max(400),
        contentState: contentStateSchema,
        coverAssetId: z.string().uuid().optional()
      },
      annotations: { title: "Create Article draft", readOnlyHint: false, openWorldHint: false }
    },
    (input) => call(async () => ({ article: await articles.createDraft({ xAccount: await accountFor(context), ...input }) }))
  );

  server.registerTool(
    "create_article_review",
    {
      description: "Upload referenced media and create a private native X Article draft. Return its private X review URL. The human must open and approve that exact X draft before scheduling it.",
      inputSchema: { articleId: z.string().uuid() },
      annotations: { title: "Create Article review", readOnlyHint: false, openWorldHint: true }
    },
    ({ articleId }) => call(async () => ({ article: await articles.createXDraft(articleId, await accountFor(context)) }))
  );

  server.registerTool(
    "list_articles",
    {
      description: "List private, reviewing, scheduled, published, and failed native X Article records for this account.",
      annotations: { title: "List Articles", readOnlyHint: true, openWorldHint: false }
    },
    () => call(async () => ({ articles: await articles.list((await accountFor(context)).id) }))
  );

  server.registerTool(
    "schedule_article",
    {
      description: "Schedule an X Article that is already in REVIEW status. Call only after the human explicitly approves the private X Article review URL and its exact scheduled time. Quill publishes the reviewed X Article later.",
      inputSchema: {
        articleId: z.string().uuid(),
        scheduledAt: z.string().datetime(),
        timezone: z.string().min(1).max(100)
      },
      annotations: { title: "Schedule approved Article", readOnlyHint: false, openWorldHint: false }
    },
    ({ articleId, scheduledAt, timezone }) => call(async () => ({
      article: await articles.schedule(articleId, (await accountFor(context)).id, new Date(scheduledAt), timezone)
    }))
  );

  server.registerTool(
    "get_cta_setting",
    {
      description: "Read the optional CTA reply text Quill uses for approved CTA automations.",
      annotations: { title: "Get CTA setting", readOnlyHint: true, openWorldHint: false }
    },
    () => call(async () => ({ cta: await cta.getSetting((await accountFor(context)).id) }))
  );

  server.registerTool(
    "set_cta_setting",
    {
      description: "Set the account's CTA reply text. This is used only by an explicitly configured CTA automation.",
      inputSchema: { text: z.string().trim().min(1).max(25_000) },
      annotations: { title: "Set CTA setting", readOnlyHint: false, idempotentHint: true, openWorldHint: false }
    },
    ({ text }) => call(async () => ({ cta: await cta.saveSetting((await accountFor(context)).id, text) }))
  );

  server.registerTool(
    "list_cta_automations",
    {
      description: "List CTA reply automations and their thresholds.",
      annotations: { title: "List CTA automations", readOnlyHint: true, openWorldHint: false }
    },
    () => call(async () => ({ automations: await cta.listAutomations((await accountFor(context)).id) }))
  );

  server.registerTool(
    "create_cta_automation",
    {
      description: "Create a CTA automation that posts the configured CTA reply after an owned X post reaches the chosen like threshold. Only use with the human's explicit approval.",
      inputSchema: {
        sourceXPostId: z.string().min(1),
        ctaText: z.string().trim().min(1).max(25_000),
        likeThreshold: z.number().int().positive()
      },
      annotations: { title: "Create CTA automation", readOnlyHint: false, openWorldHint: false }
    },
    (input) => call(async () => ({ automation: await cta.createAutomation({ xAccountId: (await accountFor(context)).id, ...input }) }))
  );

  server.registerTool(
    "delete_cta_automation",
    {
      description: "Delete a CTA automation before it can make any future reply.",
      inputSchema: { automationId: z.string().uuid() },
      annotations: { title: "Delete CTA automation", readOnlyHint: false, destructiveHint: true, openWorldHint: false }
    },
    ({ automationId }) => call(async () => cta.deleteAutomation(automationId, (await accountFor(context)).id))
  );

  server.registerTool(
    "list_repost_rules",
    {
      description: "List evergreen repost rules and their next run times.",
      annotations: { title: "List repost rules", readOnlyHint: true, openWorldHint: false }
    },
    () => call(async () => ({ rules: await repost.listRules((await accountFor(context)).id) }))
  );

  server.registerTool(
    "create_repost_rule",
    {
      description: "Create an evergreen repost rule for an existing owned X post. The worker republishes it on the chosen cadence; use only after explicit human approval.",
      inputSchema: {
        sourceUrl: z.string().url(),
        cadenceHours: z.number().int().positive(),
        nextRunAt: z.string().datetime()
      },
      annotations: { title: "Create repost rule", readOnlyHint: false, openWorldHint: true }
    },
    ({ sourceUrl, cadenceHours, nextRunAt }) => call(async () => ({
      rule: await repost.createRule({
        xAccountId: (await accountFor(context)).id,
        sourceUrl,
        cadenceHours,
        nextRunAt: new Date(nextRunAt)
      })
    }))
  );

  server.registerTool(
    "set_repost_rule_status",
    {
      description: "Pause or resume an existing evergreen repost rule.",
      inputSchema: { ruleId: z.string().uuid(), status: z.enum(["ACTIVE", "PAUSED"]) },
      annotations: { title: "Set repost rule status", readOnlyHint: false, idempotentHint: true, openWorldHint: false }
    },
    ({ ruleId, status }) => call(async () => repost.setStatus(ruleId, (await accountFor(context)).id, status))
  );

  server.registerTool(
    "delete_repost_rule",
    {
      description: "Delete an evergreen repost rule before its next run.",
      inputSchema: { ruleId: z.string().uuid() },
      annotations: { title: "Delete repost rule", readOnlyHint: false, destructiveHint: true, openWorldHint: false }
    },
    ({ ruleId }) => call(async () => repost.deleteRule(ruleId, (await accountFor(context)).id))
  );

  return server;
}
