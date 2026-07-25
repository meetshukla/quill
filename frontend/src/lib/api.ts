import type {
  AnalyticsSettings,
  AnalyticsSummary,
  CtaAutomation,
  CtaSetting,
  RepostRule,
  QueueSnapshot,
  ScheduledArticle,
  ScheduledPost,
  XAppCredentialsStatus,
  XAccount,
  XConnectionTest,
  XPostPreview,
  ManagedAccount,
  MediaAsset,
} from "./types";

export type DraftPayload = {
  text?: string;
  quotePostId?: string;
  replyToPostId?: string;
  mediaAssetIds?: string[];
  mediaIds?: string[];
  threadParts?: string[];
  scheduledAt?: string;
  timezone?: string;
};

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
  "http://localhost:8787";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

const TOKEN_KEY = "quill.token";
const ACCOUNT_KEY = "quill.managedAccountId";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

export function getSelectedAccountId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCOUNT_KEY);
}

export function setSelectedAccountId(accountId: string | null) {
  if (accountId) window.localStorage.setItem(ACCOUNT_KEY, accountId);
  else window.localStorage.removeItem(ACCOUNT_KEY);
}

async function request<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const { json, headers, ...rest } = init ?? {};
  const token = getAuthToken();
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api${path}`, {
      ...rest,
      headers: {
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(getSelectedAccountId() ? { "X-Quill-Account-Id": getSelectedAccountId()! } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(
      `Can't reach the backend at ${API_BASE_URL}. Is the server running?`,
      0,
    );
  }

  const text = await res.text();
  const data = text ? safeParse(text) : null;

  if (!res.ok) {
    // Session missing/expired → send the browser to the login screen.
    if (
      res.status === 401 &&
      typeof window !== "undefined" &&
      !window.location.pathname.startsWith("/login") &&
      !path.startsWith("/auth/")
    ) {
      clearAuthToken();
      window.location.href = "/login";
    }
    const message =
      (data && typeof data === "object" && "error" in data
        ? String((data as Record<string, unknown>).error)
        : undefined) ??
      (data && typeof data === "object" && "message" in data
        ? String((data as Record<string, unknown>).message)
        : undefined) ??
      `Request failed (${res.status})`;
    throw new ApiError(message, res.status, data);
  }

  return data as T;
}

async function requestBlob(path: string): Promise<Blob> {
  const token = getAuthToken();
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(getSelectedAccountId() ? { "X-Quill-Account-Id": getSelectedAccountId()! } : {}),
    },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(`Can't reach the backend at ${API_BASE_URL}. Is the server running?`, 0);
  }
  if (!response.ok) {
    const text = await response.text();
    const data = text ? safeParse(text) : null;
    throw new ApiError(`Could not load attached media (${response.status})`, response.status, data);
  }
  return response.blob();
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export type PostPayload = {
  text?: string;
  quotePostId?: string;
  replyToPostId?: string;
  mediaAssetIds?: string[];
  mediaIds?: string[];
  threadParts?: string[];
};

export type ExtensionInstallation = {
  id: string;
  label: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export const api = {
  health: () => request<{ ok: boolean }>("/health"),

  // Personal account auth
  signup: (email: string, password: string, name?: string) =>
    request<{ token: string }>("/auth/signup", {
      method: "POST",
      json: { email, password, name },
    }),
  login: (email: string, password: string) =>
    request<{ token: string }>("/auth/login", {
      method: "POST",
      json: { email, password },
    }),
  getAgentInfo: () =>
    request<{ apiUrl: string; apiKey: string }>("/setup/agent"),
  listManagedAccounts: () => request<{ accounts: ManagedAccount[] }>("/accounts"),
  getWorkspace: () => request<{ accounts: { account: ManagedAccount; queue: QueueSnapshot; articles: ScheduledArticle[] }[] }>("/workspace"),
  listExtensionInstallations: () =>
    request<{ installations: ExtensionInstallation[] }>("/setup/extensions"),
  createExtensionInstallation: (label?: string) =>
    request<{ installation: ExtensionInstallation; token: string }>("/setup/extensions", {
      method: "POST",
      json: { label },
    }),
  revokeExtensionInstallation: (id: string) =>
    request<{ ok: boolean }>(`/setup/extensions/${id}`, { method: "DELETE" }),

  // X account
  getAccount: () => request<{ account: XAccount | null }>("/x/account"),
  getXAppCredentials: () => request<XAppCredentialsStatus>("/x/app-credentials"),
  saveXAppCredentials: (input: { clientId: string; clientSecret?: string }) =>
    request<XAppCredentialsStatus>("/x/app-credentials", {
      method: "PUT",
      json: input,
    }),
  // Legacy migration endpoint only. New connections use app credentials and
  // OAuth, so users never manually paste user access or refresh tokens.
  saveXConnection: (input: { clientId: string; clientSecret: string; accessToken: string; refreshToken: string }) =>
    request<{ account: { username: string; writeEnabled: boolean } }>("/x/connection", {
      method: "POST",
      json: input,
    }),
  startXAuthorization: () =>
    request<{ authorizeUrl: string }>("/x/connection/authorize", { method: "POST" }),
  testXConnection: () =>
    request<XConnectionTest>("/x/connection/test", { method: "POST" }),

  // Private asset preview/download. The Authorization header keeps media off
  // public storage URLs while allowing the Queue to review an attached video.
  getMediaAssetBlob: (id: string) => requestBlob(`/media/assets/${id}/content`),
  listMediaAssets: () => request<{ assets: MediaAsset[] }>("/media/assets"),

  // Composer
  publishPost: (payload: PostPayload) =>
    request<{ post: unknown }>("/composer/post", {
      method: "POST",
      json: payload,
    }),
  schedulePost: (
    payload: PostPayload & { scheduledAt: string; timezone: string },
  ) =>
    request<{ scheduledPost: ScheduledPost }>("/composer/schedule", {
      method: "POST",
      json: payload,
    }),
  quotePreview: (postId: string) =>
    request<{ post: XPostPreview | null }>("/composer/quote-preview", {
      method: "POST",
      json: { postId },
    }),

  // Scheduled posts / queue
  getQueue: () => request<QueueSnapshot>("/queue"),
  listArticles: () => request<{ articles: ScheduledArticle[] }>("/articles"),
  createArticle: (payload: { title: string; contentState: ScheduledArticle["contentState"]; coverAssetId?: string | null }) => request<{ article: ScheduledArticle }>("/articles", { method: "POST", json: payload }),
  updateArticle: (id: string, payload: { title: string; contentState: ScheduledArticle["contentState"]; coverAssetId?: string | null }) => request<{ article: ScheduledArticle }>(`/articles/${id}`, { method: "PATCH", json: payload }),
  deleteArticle: (id: string) => request<{ ok: boolean }>(`/articles/${id}`, { method: "DELETE" }),
  createArticleReview: (id: string) => request<{ article: ScheduledArticle }>(`/articles/${id}/review`, { method: "POST" }),
  scheduleArticle: (id: string, scheduledAt: string, timezone: string) => request<{ article: ScheduledArticle }>(`/articles/${id}/schedule`, { method: "POST", json: { scheduledAt, timezone } }),
  listScheduled: () =>
    request<{ scheduledPosts: ScheduledPost[] }>("/scheduled-posts"),
  cancelScheduled: (id: string) =>
    request<{ scheduledPost: unknown }>(`/scheduled-posts/${id}`, {
      method: "DELETE",
    }),
  retryScheduled: (id: string) =>
    request<{ scheduledPost: ScheduledPost }>(`/scheduled-posts/${id}/retry`, {
      method: "POST",
    }),

  // Drafts (agent proposes → you approve)
  listDrafts: () => request<{ drafts: ScheduledPost[] }>("/drafts"),
  createDraft: (payload: DraftPayload) =>
    request<{ draft: ScheduledPost }>("/drafts", {
      method: "POST",
      json: payload,
    }),
  updateDraft: (id: string, payload: DraftPayload) => request<{ draft: ScheduledPost }>(`/drafts/${id}`, { method: "PATCH", json: payload }),
  scheduleDraft: (id: string, scheduledAt: string, timezone: string) =>
    request<{ scheduledPost: ScheduledPost }>(`/drafts/${id}/schedule`, {
      method: "POST",
      json: { scheduledAt, timezone },
    }),
  deleteDraft: (id: string) =>
    request<{ ok: boolean }>(`/drafts/${id}`, { method: "DELETE" }),

  // CTA
  getCta: () => request<{ cta: CtaSetting }>("/cta"),
  saveCta: (text: string) =>
    request<{ cta: CtaSetting }>("/cta", { method: "PUT", json: { text } }),
  listCtaAutomations: () =>
    request<{ automations: CtaAutomation[] }>("/cta/automations"),
  createCtaAutomation: (payload: {
    sourceXPostId: string;
    ctaText: string;
    likeThreshold: number;
  }) =>
    request<{ automation: CtaAutomation }>("/cta/automations", {
      method: "POST",
      json: payload,
    }),
  deleteCtaAutomation: (id: string) =>
    request<{ ok: boolean }>(`/cta/automations/${id}`, { method: "DELETE" }),

  // Repost
  validateRepost: (sourceUrl: string) =>
    request<{ sourceXPostId: string; post: XPostPreview | null }>(
      "/repost-rules/validate",
      { method: "POST", json: { sourceUrl } },
    ),
  createRepost: (payload: {
    sourceUrl: string;
    cadenceHours: number;
    nextRunAt: string;
  }) =>
    request<{ rule: RepostRule }>("/repost-rules", {
      method: "POST",
      json: payload,
    }),
  listRepostRules: () => request<{ rules: RepostRule[] }>("/repost-rules"),
  updateRepostRule: (id: string, payload: { status: string }) =>
    request<{ rule: RepostRule }>(`/repost-rules/${id}`, {
      method: "PATCH",
      json: payload,
    }),
  deleteRepostRule: (id: string) =>
    request<{ ok: boolean }>(`/repost-rules/${id}`, { method: "DELETE" }),

  // Analytics
  getAnalyticsSettings: () =>
    request<AnalyticsSettings>("/analytics/settings"),
  saveAnalyticsSettings: (payload: {
    analyticsEnabled: boolean;
    analyticsWindowDays: number;
    analyticsRetentionDays: number;
  }) =>
    request<{ settings: Omit<AnalyticsSettings, "analyticsMaxPosts"> }>(
      "/analytics/settings",
      { method: "PUT", json: payload },
    ),
  syncAnalytics: () =>
    request<{ synced?: number; skipped?: string }>("/analytics/sync", {
      method: "POST",
    }),
  getAnalyticsSummary: () =>
    request<{ disabled: boolean; summary: AnalyticsSummary | null }>(
      "/analytics/summary",
    ),
};
