import type { PrismaClient } from "@prisma/client";

export type AssistantAction =
  | { type: "open_composer"; text: string; mode?: "post" | "schedule"; suggestedScheduledAt?: string }
  | { type: "use_in_composer"; text: string; target: "active_draft" };

export class AssistantService {
  constructor(private readonly prisma: PrismaClient) {}

  async createChat(xAccountId: string, title?: string) {
    return this.prisma.assistantChat.create({
      data: { xAccountId, title: title ?? "New chat" }
    });
  }

  async listChats(xAccountId: string) {
    return this.prisma.assistantChat.findMany({
      where: { xAccountId },
      orderBy: { updatedAt: "desc" },
      take: 50
    });
  }

  async draftRewrite(input: {
    chatId?: string;
    draft: string;
    instruction: "punchier" | "shorter" | "hook" | "ideas" | string;
  }) {
    const prompt = buildRewritePrompt(input.draft, input.instruction);
    const options = buildFallbackRewriteOptions(input.draft, input.instruction);
    const actions: AssistantAction[] = options.map((text) => ({
      type: "use_in_composer",
      text,
      target: "active_draft"
    }));

    if (input.chatId) {
      await this.prisma.assistantMessage.createMany({
        data: [
          { chatId: input.chatId, role: "USER", content: prompt },
          {
            chatId: input.chatId,
            role: "ASSISTANT",
            content: options.map((option, index) => `Option ${index + 1}: ${option}`).join("\n\n"),
            structuredActions: actions
          }
        ]
      });
    }

    return { prompt, options, actions };
  }

  async buildContext(xAccountId: string) {
    const account = await this.prisma.xAccount.findUniqueOrThrow({
      where: { id: xAccountId },
      include: { user: true, ctaSetting: true }
    });
    const recentPosts = account.user.analyticsEnabled
      ? await this.prisma.post.findMany({
          where: { xAccountId, expiresAt: { gt: new Date() } },
          orderBy: { createdAtX: "desc" },
          take: 50
        })
      : [];
    const scheduled = await this.prisma.scheduledPost.findMany({
      where: { xAccountId, status: "SCHEDULED" },
      orderBy: { scheduledAt: "asc" },
      take: 20
    });

    return {
      handle: account.username,
      analyticsEnabled: account.user.analyticsEnabled,
      writingProfile: account.user.writingProfile,
      cta: account.ctaSetting?.text ?? null,
      recentPosts,
      scheduled
    };
  }
}

function buildRewritePrompt(draft: string, instruction: string) {
  return `Rewrite this draft for ${instruction}. Keep the user's voice and do not publish anything.\n\n${draft}`;
}

function buildFallbackRewriteOptions(draft: string, instruction: string) {
  const trimmed = draft.trim();
  if (!trimmed) return ["Write one specific post idea based on your current goal."];
  if (instruction === "shorter") return [trimmed.split(/\s+/).slice(0, 32).join(" ")];
  if (instruction === "hook") return [`Most people miss this: ${trimmed}`];
  return [
    trimmed.replace(/\bI think\b/gi, "").replace(/\s+/g, " ").trim(),
    `${trimmed}\n\nThe edge is consistency: ship, learn, repeat.`
  ];
}

