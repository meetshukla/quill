import type { PrismaClient, XAccount, XOperationType } from "@prisma/client";
import { decryptSecret, encryptSecret } from "../lib/crypto.js";
import type { XListResponse, XPost, XSingleResponse, XTokenResponse, XUser } from "../types/x.js";
import { XUsageService } from "./x-usage.service.js";

const X_API_BASE = "https://api.x.com/2";

type XRequestOptions = {
  method?: string;
  body?: unknown;
  operationType: XOperationType;
  ownedResourcesCharged?: number;
  resourcesReturned?: number;
  skipUsageLog?: boolean;
};

export class XClientService {
  private readonly usage: XUsageService;

  constructor(private readonly prisma: PrismaClient) {
    this.usage = new XUsageService(prisma);
  }

  async getMe(xAccount: XAccount): Promise<XUser> {
    const response = await this.request<XSingleResponse<XUser>>(
      xAccount,
      "/users/me?user.fields=profile_image_url",
      { operationType: "OWNED_READ", ownedResourcesCharged: 1, resourcesReturned: 1 }
    );
    if (!response.data) throw new Error("X /users/me did not return a user");
    return response.data;
  }

  async listOwnedPosts(input: {
    xAccount: XAccount;
    sinceId?: string;
    paginationToken?: string;
    maxResults?: number;
    /** include the parent of replies/quotes in `includes.tweets` (one call) */
    withReferenced?: boolean;
  }): Promise<XListResponse<XPost>> {
    const params = new URLSearchParams({
      max_results: String(input.maxResults ?? 100),
      "tweet.fields": [
        "created_at",
        "author_id",
        "conversation_id",
        "in_reply_to_user_id",
        "referenced_tweets",
        "attachments",
        "entities",
        "public_metrics",
        "organic_metrics",
        "non_public_metrics"
      ].join(",")
    });
    if (input.withReferenced) {
      params.set("expansions", "referenced_tweets.id");
    }
    if (input.sinceId) params.set("since_id", input.sinceId);
    if (input.paginationToken) params.set("pagination_token", input.paginationToken);

    const result = await this.request<XListResponse<XPost>>(
      input.xAccount,
      `/users/${input.xAccount.xUserId}/tweets?${params.toString()}`,
      { operationType: "OWNED_READ", skipUsageLog: true }
    );
    const count = result.data?.length ?? 0;
    await this.usage.logEvent({
      xAccountId: input.xAccount.id,
      endpoint: "/users/:id/tweets",
      method: "GET",
      operationType: "OWNED_READ",
      resourcesReturned: count,
      ownedResourcesCharged: count
    });
    return result;
  }

  async lookupPosts(xAccount: XAccount, ids: string[], owned = true): Promise<XListResponse<XPost>> {
    if (ids.length === 0) return { data: [] };
    const params = new URLSearchParams({
      ids: ids.join(","),
      "tweet.fields": [
        "created_at",
        "author_id",
        "conversation_id",
        "in_reply_to_user_id",
        "referenced_tweets",
        "attachments",
        "entities",
        "public_metrics",
        "organic_metrics",
        "non_public_metrics"
      ].join(",")
    });
    const result = await this.request<XListResponse<XPost>>(xAccount, `/tweets?${params.toString()}`, {
      operationType: owned ? "OWNED_READ" : "EXTERNAL_READ",
      skipUsageLog: true
    });
    const count = result.data?.length ?? 0;
    await this.usage.logEvent({
      xAccountId: xAccount.id,
      endpoint: "/tweets",
      method: "GET",
      operationType: owned ? "OWNED_READ" : "EXTERNAL_READ",
      resourcesReturned: count,
      ownedResourcesCharged: owned ? count : 0
    });
    return result;
  }

  async createPost(
    xAccount: XAccount,
    body: {
      text?: string;
      quote_tweet_id?: string;
      reply?: { in_reply_to_tweet_id: string };
      media?: { media_ids: string[] };
    }
  ): Promise<XSingleResponse<{ id: string; text: string }>> {
    return this.request(xAccount, "/tweets", {
      method: "POST",
      body,
      operationType: "WRITE"
    });
  }

  async repost(xAccount: XAccount, tweetId: string): Promise<XSingleResponse<{ retweeted: boolean }>> {
    return this.request(xAccount, `/users/${xAccount.xUserId}/retweets`, {
      method: "POST",
      body: { tweet_id: tweetId },
      operationType: "WRITE"
    });
  }

  async refreshTokens(xAccount: XAccount, tokenResponse: XTokenResponse) {
    await this.prisma.xAccount.update({
      where: { id: xAccount.id },
      data: {
        accessTokenEncrypted: encryptSecret(tokenResponse.access_token),
        refreshTokenEncrypted: tokenResponse.refresh_token
          ? encryptSecret(tokenResponse.refresh_token)
          : xAccount.refreshTokenEncrypted,
        scopes: tokenResponse.scope?.split(/\s+/).filter(Boolean) ?? xAccount.scopes
      }
    });
  }

  private async request<T>(xAccount: XAccount, path: string, options: XRequestOptions): Promise<T> {
    const method = options.method ?? "GET";
    const response = await fetch(`${X_API_BASE}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${decryptSecret(xAccount.accessTokenEncrypted)}`,
        "content-type": "application/json"
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    if (!options.skipUsageLog) {
      await this.usage.logEvent({
        xAccountId: xAccount.id,
        endpoint: path.split("?")[0] ?? path,
        method,
        operationType: options.operationType,
        statusCode: response.status,
        resourcesReturned: options.resourcesReturned ?? 0,
        ownedResourcesCharged: options.ownedResourcesCharged ?? 0,
        rateLimitLimit: readIntHeader(response, "x-rate-limit-limit"),
        rateLimitRemaining: readIntHeader(response, "x-rate-limit-remaining"),
        rateLimitReset: readResetHeader(response)
      });
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`X API ${method} ${path} failed: ${response.status} ${text}`);
    }

    return (await response.json()) as T;
  }
}

function readIntHeader(response: Response, name: string) {
  const value = response.headers.get(name);
  return value ? Number(value) : undefined;
}

function readResetHeader(response: Response) {
  const value = response.headers.get("x-rate-limit-reset");
  return value ? new Date(Number(value) * 1000) : undefined;
}
