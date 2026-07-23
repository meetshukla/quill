import type { PrismaClient, XAccount } from "@prisma/client";
import type { XOperationType } from "../lib/db-enums.js";
import { AppConfigService } from "./app-config.service.js";
import { decryptSecret, encryptSecret } from "../lib/crypto.js";
import type { XListResponse, XPost, XSingleResponse, XTokenResponse, XUser } from "../types/x.js";
import { XUsageService } from "./x-usage.service.js";

const X_API_BASE = "https://api.x.com/2";
const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";

type XRequestOptions = {
  method?: string;
  body?: unknown;
  form?: FormData;
  operationType: XOperationType;
  ownedResourcesCharged?: number;
  resourcesReturned?: number;
  skipUsageLog?: boolean;
};

type XMediaUploadResponse = {
  data?: {
    id?: string;
    processing_info?: {
      state?: "pending" | "in_progress" | "succeeded" | "failed";
      check_after_secs?: number;
      error?: { message?: string };
    };
  };
};

type XArticleDraftResponse = { data?: { id?: string; title?: string } };
type XArticlePublishResponse = { data?: { post_id?: string } };

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

  async createArticleDraft(xAccount: XAccount, body: { title: string; content_state: unknown; cover_media?: { media_category: string; media_id: string } }) {
    return this.request<XArticleDraftResponse>(xAccount, "/articles/draft", {
      method: "POST",
      body,
      operationType: "WRITE"
    });
  }

  async publishArticle(xAccount: XAccount, articleId: string) {
    return this.request<XArticlePublishResponse>(xAccount, `/articles/${encodeURIComponent(articleId)}/publish`, {
      method: "POST",
      operationType: "WRITE"
    });
  }

  // X media IDs expire. Quill keeps the original, user-owned file in its own
  // durable storage and makes a fresh upload immediately before publishing.
  async uploadMedia(
    xAccount: XAccount,
    input: { data: Buffer; filename: string; contentType: string }
  ): Promise<string> {
    if (input.contentType !== "image/gif" && input.contentType.startsWith("image/")) {
      const result = await this.request<XMediaUploadResponse>(xAccount, "/media/upload", {
        method: "POST",
        operationType: "MEDIA",
        body: {
          media: input.data.toString("base64"),
          media_category: "tweet_image",
          media_type: input.contentType
        }
      });
      return requireMediaId(result);
    }

    const init = new FormData();
    init.set("command", "INIT");
    init.set("media_type", input.contentType);
    init.set("total_bytes", String(input.data.length));
    init.set("media_category", input.contentType === "image/gif" ? "tweet_gif" : "tweet_video");
    const initialized = await this.request<XMediaUploadResponse>(xAccount, "/media/upload", {
      method: "POST",
      operationType: "MEDIA",
      form: init
    });
    const mediaId = requireMediaId(initialized);

    const chunkBytes = 1024 * 1024;
    for (let offset = 0, segment = 0; offset < input.data.length; offset += chunkBytes, segment += 1) {
      const sourceChunk = input.data.subarray(offset, Math.min(offset + chunkBytes, input.data.length));
      // Copy to a plain Uint8Array so TypeScript does not treat Node's Buffer
      // backing store as a potentially shared ArrayBuffer in the DOM Blob API.
      const chunk = new Uint8Array(sourceChunk.byteLength);
      chunk.set(sourceChunk);
      const append = new FormData();
      append.set("command", "APPEND");
      append.set("media_id", mediaId);
      append.set("segment_index", String(segment));
      append.set(
        "media",
        new Blob([chunk], {
          type: input.contentType
        }),
        input.filename
      );
      await this.request<void>(xAccount, "/media/upload", {
        method: "POST",
        operationType: "MEDIA",
        form: append
      });
    }

    const finalize = new FormData();
    finalize.set("command", "FINALIZE");
    finalize.set("media_id", mediaId);
    const finalized = await this.request<XMediaUploadResponse>(xAccount, "/media/upload", {
      method: "POST",
      operationType: "MEDIA",
      form: finalize
    });
    await this.waitForMediaProcessing(xAccount, mediaId, finalized);
    return mediaId;
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
        scopes: tokenResponse.scope?.split(/\s+/).filter(Boolean) ?? (xAccount.scopes as string[])
      }
    });
  }

  // Exchange the refresh token for a new access token. X rotates refresh
  // tokens (single-use), so the new one must be stored immediately.
  private async refreshAccessToken(xAccount: XAccount): Promise<XAccount | null> {
    if (!xAccount.refreshTokenEncrypted) return null;
    const fallback = await new AppConfigService(this.prisma).getXCredentials();
    const clientId = xAccount.xClientIdEncrypted
      ? decryptSecret(xAccount.xClientIdEncrypted)
      : fallback.clientId;
    const clientSecret = xAccount.xClientSecretEncrypted
      ? decryptSecret(xAccount.xClientSecretEncrypted)
      : fallback.clientSecret;
    if (!clientId) return null;
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: decryptSecret(xAccount.refreshTokenEncrypted),
      client_id: clientId
    });
    // Native and SPA X apps are public clients: they must refresh with the
    // client_id in the body and no Basic secret. Confidential apps accept
    // Basic auth, so fall back to it only if the public-client request fails.
    let response = await fetch(X_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    });
    if (!response.ok && clientSecret) {
      response = await fetch(X_TOKEN_URL, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: decryptSecret(xAccount.refreshTokenEncrypted),
          client_id: clientId
        })
      });
    }
    if (!response.ok) return null;
    const token = (await response.json()) as XTokenResponse;
    return this.prisma.xAccount.update({
      where: { id: xAccount.id },
      data: {
        accessTokenEncrypted: encryptSecret(token.access_token),
        refreshTokenEncrypted: token.refresh_token
          ? encryptSecret(token.refresh_token)
          : xAccount.refreshTokenEncrypted
      }
    });
  }

  private async request<T>(
    xAccount: XAccount,
    path: string,
    options: XRequestOptions,
    hasRetriedAuth = false
  ): Promise<T> {
    const method = options.method ?? "GET";
    const headers: Record<string, string> = {
      authorization: `Bearer ${decryptSecret(xAccount.accessTokenEncrypted)}`
    };
    if (!options.form) headers["content-type"] = "application/json";
    const response = await fetch(`${X_API_BASE}${path}`, {
      method,
      headers,
      body: options.form ?? (options.body ? JSON.stringify(options.body) : undefined)
    });

    // Access tokens expire (~2h). On the first 401, refresh with the stored
    // refresh token and retry the request once with the new credentials.
    if (response.status === 401 && !hasRetriedAuth && xAccount.refreshTokenEncrypted) {
      const refreshed = await this.refreshAccessToken(xAccount);
      if (refreshed) return this.request(refreshed, path, options, true);
    }

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

    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private async waitForMediaProcessing(
    xAccount: XAccount,
    mediaId: string,
    initial: XMediaUploadResponse
  ) {
    let current = initial;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const processing = current.data?.processing_info;
      if (!processing || processing.state === "succeeded") return;
      if (processing.state === "failed") {
        throw new Error(`X could not process this video: ${processing.error?.message ?? "unknown error"}`);
      }
      const delay = Math.min(Math.max(processing.check_after_secs ?? 1, 1), 10);
      await new Promise((resolve) => setTimeout(resolve, delay * 1000));
      current = await this.request<XMediaUploadResponse>(
        xAccount,
        `/media/upload?command=STATUS&media_id=${encodeURIComponent(mediaId)}`,
        { operationType: "MEDIA" }
      );
    }
    throw new Error("X is still processing this video. Try publishing again in a few minutes.");
  }
}

function requireMediaId(response: XMediaUploadResponse) {
  const id = response.data?.id;
  if (!id) throw new Error("X media upload did not return a media ID");
  return id;
}

function readIntHeader(response: Response, name: string) {
  const value = response.headers.get(name);
  return value ? Number(value) : undefined;
}

function readResetHeader(response: Response) {
  const value = response.headers.get("x-rate-limit-reset");
  return value ? new Date(Number(value) * 1000) : undefined;
}
