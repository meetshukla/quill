import type { ResearchItem, User } from "@prisma/client";
import { env } from "../config/env.js";

const FALLBACK_REPLY_PROFILE = `
You write useful founder-to-founder X replies for Ghostfeed, focused on AI UGC,
creative testing, short-form formats, and distribution. Write in lowercase by
default, with direct normal words and one concrete point. Address the parent post
first. Mention Ghostfeed only if genuinely useful. Never invent proof, metrics,
customers, testimonials, capabilities, or outcomes. No generic AI hype,
hashtags, corporate phrasing, competitor attacks, engagement bait, or forced
product pitches. Return SKIP when there is no natural, useful reply.
`.trim();

export class ReplyGenerationService {
  async generateReply(
    user: Pick<User, "replyProfile">,
    item: Pick<ResearchItem, "text" | "title" | "sourceHandle" | "url">
  ) {
    if (env.AI_PROVIDER.toLowerCase() !== "gemini" || !env.AI_API_KEY) {
      throw new Error("gemini_not_configured");
    }
    const profile = readReplyProfile(user.replyProfile) ?? FALLBACK_REPLY_PROFILE;
    const prompt = `Draft ONE X reply for a human to review.\n\nReply profile:\n${profile}\n\nParent post:\nAuthor: ${item.sourceHandle ? `@${item.sourceHandle}` : "unknown"}\nURL: ${item.url}\nText: ${(item.text || item.title || "").slice(0, 12_000)}\n\nHuman standard: respond to one exact detail in this post. Never write generic positioning, an industry sermon, or a contrast like "most X do Y, but Z". Never start from "the real problem" or "the problem isn't". If you cannot make a specific, natural reply, return exactly SKIP.\n\nReturn only the reply text, or exactly SKIP.`;
    const first = await this.requestReply(prompt);
    if (!first || !isGenericContrast(first)) return first;
    const retry = await this.requestReply(`${prompt}\n\nYour first draft was rejected because it sounded like generic AI contrast copy. Write a new reply grounded in a concrete detail from the parent post; do not explain an entire category of tools or workflows.`);
    return retry && !isGenericContrast(retry) ? retry : null;
  }

  private async requestReply(prompt: string) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.AI_MODEL)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.AI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: "You prepare truthful, concise, human X reply drafts. You never claim to have posted anything or use generic contrast-copy templates." }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }]
        }),
        signal: AbortSignal.timeout(45_000)
      }
    );
    const body = (await response.json().catch(() => null)) as GeminiResponse | null;
    if (!response.ok) throw new Error(`gemini_request_failed_${response.status}`);
    const text = body?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
    if (!text) throw new Error("gemini_empty_reply");
    return normaliseReply(text);
  }
}

function readReplyProfile(value: unknown) {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object" && "profile" in value && typeof value.profile === "string") {
    return value.profile.trim() || null;
  }
  return null;
}

function normaliseReply(value: string) {
  const text = value.replace(/^['"`]|['"`]$/g, "").trim();
  if (text.toUpperCase() === "SKIP") return null;
  if (text.length < 2 || text.length > 1_000) throw new Error("gemini_invalid_reply");
  return text;
}

function isGenericContrast(value: string) {
  const text = value.toLowerCase().replace(/\s+/g, " ");
  return /\b(?:most|many|some|a lot of)\s+(?:\w+\s+){0,6}(?:but|while)\b/.test(text)
    || /\bthe (?:real )?problem (?:is|isn't)\b/.test(text)
    || /\bnot\s+.+\s+but\s+/.test(text);
}

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};
