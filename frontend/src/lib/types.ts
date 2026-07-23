// Types mirror the backend API contract.
// Source of truth: backend/src/routes/*.ts and prisma/schema.prisma

export type XAccount = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  scopes: string[];
  writeEnabled: boolean;
  lastSyncedAt: string | null;
  analyticsLastSyncedAt: string | null;
};

export type XAppCredentialsStatus = {
  configured: boolean;
  callbackUrl: string;
};

export type ScheduledPostStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "POSTING"
  | "POSTED"
  | "FAILED"
  | "CANCELED";

export type ScheduledPost = {
  id: string;
  xAccountId: string;
  status: ScheduledPostStatus;
  text: string | null;
  threadParts: { parts: string[] } | null;
  quotePostId: string | null;
  replyToPostId: string | null;
  media: { assetIds?: string[]; mediaIds?: string[] } | null;
  scheduledAt: string;
  timezone: string;
  postedXPostId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type QueueSnapshot = {
  drafts: ScheduledPost[];
  scheduled: ScheduledPost[];
  posting: ScheduledPost[];
  failed: ScheduledPost[];
  posted: ScheduledPost[];
};

export type CtaSetting = {
  id: string;
  xAccountId: string;
  text: string | null;
  createdAt: string;
  updatedAt: string;
} | null;

export type AutomationStatus =
  | "PENDING"
  | "ACTIVE"
  | "POSTED"
  | "PAUSED"
  | "FAILED"
  | "CANCELED"
  | "EXPIRED";

export type CtaAutomation = {
  id: string;
  xAccountId: string;
  sourceXPostId: string;
  ctaText: string;
  likeThreshold: number;
  status: AutomationStatus;
  replyXPostId: string | null;
  lastCheckedAt: string | null;
  expiresAt: string;
  postedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RepostRule = {
  id: string;
  xAccountId: string;
  sourceXPostId: string;
  sourceUrl: string;
  status: AutomationStatus;
  cadenceHours: number;
  nextRunAt: string;
  lastRunAt: string | null;
  lastRepostXPostId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type XPostPreview = {
  id: string;
  text: string;
  created_at?: string;
  author_id?: string;
  public_metrics?: {
    like_count?: number;
    retweet_count?: number;
    reply_count?: number;
    impression_count?: number;
    bookmark_count?: number;
  };
};

export type AnalyticsSettings = {
  analyticsEnabled: boolean;
  analyticsWindowDays: number;
  analyticsRetentionDays: number;
  analyticsMaxPosts: number;
};

export type AnalyticsSummary = {
  posts: number;
  views: number;
  likes: number;
  reposts: number;
  replies: number;
  bookmarks: number;
  engagementRate: number | null;
};

export type ComposerMode = "original" | "quote" | "reply" | "thread";
