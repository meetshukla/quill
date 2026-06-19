-- CreateEnum
CREATE TYPE "ScheduledPostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'POSTING', 'POSTED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('ORIGINAL', 'REPLY', 'QUOTE', 'REPOST');

-- CreateEnum
CREATE TYPE "AutomationStatus" AS ENUM ('PENDING', 'ACTIVE', 'POSTED', 'PAUSED', 'FAILED', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AssistantRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "XOperationType" AS ENUM ('OWNED_READ', 'EXTERNAL_READ', 'WRITE', 'MEDIA', 'AUTH');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "themeAccent" TEXT NOT NULL DEFAULT '#009ef8',
    "assistantCollapsed" BOOLEAN NOT NULL DEFAULT false,
    "analyticsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "analyticsWindowDays" INTEGER NOT NULL DEFAULT 7,
    "analyticsRetentionDays" INTEGER NOT NULL DEFAULT 14,
    "monthlyOwnedReadBudget" INTEGER NOT NULL DEFAULT 10000,
    "dailyOwnedReadSoftLimit" INTEGER NOT NULL DEFAULT 300,
    "dailyOwnedReadHardLimit" INTEGER NOT NULL DEFAULT 500,
    "writingProfile" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "redirectAfter" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "xUserId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "accessTokenEncrypted" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT,
    "scopes" TEXT[],
    "writeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMP(3),
    "analyticsLastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "xAccountId" TEXT NOT NULL,
    "xPostId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAtX" TIMESTAMP(3) NOT NULL,
    "postType" "PostType" NOT NULL,
    "conversationId" TEXT,
    "inReplyToUserId" TEXT,
    "referencedTweets" JSONB,
    "attachments" JSONB,
    "entities" JSONB,
    "publicMetrics" JSONB,
    "organicMetrics" JSONB,
    "nonPublicMetrics" JSONB,
    "views" INTEGER,
    "likes" INTEGER,
    "reposts" INTEGER,
    "replies" INTEGER,
    "bookmarks" INTEGER,
    "engagementRate" DECIMAL(65,30),
    "lastMetricsSyncedAt" TIMESTAMP(3),
    "rawX" JSONB,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledPost" (
    "id" TEXT NOT NULL,
    "xAccountId" TEXT NOT NULL,
    "status" "ScheduledPostStatus" NOT NULL DEFAULT 'SCHEDULED',
    "text" TEXT,
    "threadParts" JSONB,
    "quotePostId" TEXT,
    "replyToPostId" TEXT,
    "media" JSONB,
    "ctaConfig" JSONB,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "postedXPostId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CtaSetting" (
    "id" TEXT NOT NULL,
    "xAccountId" TEXT NOT NULL,
    "text" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CtaSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CtaAutomation" (
    "id" TEXT NOT NULL,
    "xAccountId" TEXT NOT NULL,
    "sourceXPostId" TEXT NOT NULL,
    "ctaText" TEXT NOT NULL,
    "likeThreshold" INTEGER NOT NULL DEFAULT 50,
    "status" "AutomationStatus" NOT NULL DEFAULT 'PENDING',
    "replyXPostId" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "postedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CtaAutomation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoRepostRule" (
    "id" TEXT NOT NULL,
    "xAccountId" TEXT NOT NULL,
    "sourceXPostId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "status" "AutomationStatus" NOT NULL DEFAULT 'ACTIVE',
    "cadenceHours" INTEGER NOT NULL,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastRepostXPostId" TEXT,
    "idempotencySeed" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoRepostRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantChat" (
    "id" TEXT NOT NULL,
    "xAccountId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantMessage" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "role" "AssistantRole" NOT NULL,
    "content" TEXT NOT NULL,
    "structuredActions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedWritingExample" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "text" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedWritingExample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XApiUsageEvent" (
    "id" TEXT NOT NULL,
    "xAccountId" TEXT,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "operationType" "XOperationType" NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 1,
    "resourcesReturned" INTEGER NOT NULL DEFAULT 0,
    "ownedResourcesCharged" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "statusCode" INTEGER,
    "rateLimitLimit" INTEGER,
    "rateLimitRemaining" INTEGER,
    "rateLimitReset" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XApiUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthState_state_key" ON "OAuthState"("state");

-- CreateIndex
CREATE INDEX "OAuthState_expiresAt_idx" ON "OAuthState"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "XAccount_userId_key" ON "XAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "XAccount_xUserId_key" ON "XAccount"("xUserId");

-- CreateIndex
CREATE INDEX "Post_xAccountId_createdAtX_idx" ON "Post"("xAccountId", "createdAtX");

-- CreateIndex
CREATE INDEX "Post_xAccountId_expiresAt_idx" ON "Post"("xAccountId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Post_xAccountId_xPostId_key" ON "Post"("xAccountId", "xPostId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledPost_idempotencyKey_key" ON "ScheduledPost"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ScheduledPost_status_scheduledAt_idx" ON "ScheduledPost"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "CtaSetting_xAccountId_key" ON "CtaSetting"("xAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "CtaAutomation_idempotencyKey_key" ON "CtaAutomation"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CtaAutomation_status_lastCheckedAt_idx" ON "CtaAutomation"("status", "lastCheckedAt");

-- CreateIndex
CREATE INDEX "CtaAutomation_xAccountId_sourceXPostId_idx" ON "CtaAutomation"("xAccountId", "sourceXPostId");

-- CreateIndex
CREATE UNIQUE INDEX "AutoRepostRule_idempotencySeed_key" ON "AutoRepostRule"("idempotencySeed");

-- CreateIndex
CREATE INDEX "AutoRepostRule_status_nextRunAt_idx" ON "AutoRepostRule"("status", "nextRunAt");

-- CreateIndex
CREATE INDEX "AssistantMessage_chatId_createdAt_idx" ON "AssistantMessage"("chatId", "createdAt");

-- CreateIndex
CREATE INDEX "SavedWritingExample_userId_idx" ON "SavedWritingExample"("userId");

-- CreateIndex
CREATE INDEX "XApiUsageEvent_xAccountId_createdAt_idx" ON "XApiUsageEvent"("xAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "XApiUsageEvent_operationType_createdAt_idx" ON "XApiUsageEvent"("operationType", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_type_availableAt_idx" ON "OutboxEvent"("type", "availableAt");

-- AddForeignKey
ALTER TABLE "OAuthState" ADD CONSTRAINT "OAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XAccount" ADD CONSTRAINT "XAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_xAccountId_fkey" FOREIGN KEY ("xAccountId") REFERENCES "XAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledPost" ADD CONSTRAINT "ScheduledPost_xAccountId_fkey" FOREIGN KEY ("xAccountId") REFERENCES "XAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CtaSetting" ADD CONSTRAINT "CtaSetting_xAccountId_fkey" FOREIGN KEY ("xAccountId") REFERENCES "XAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CtaAutomation" ADD CONSTRAINT "CtaAutomation_xAccountId_fkey" FOREIGN KEY ("xAccountId") REFERENCES "XAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoRepostRule" ADD CONSTRAINT "AutoRepostRule_xAccountId_fkey" FOREIGN KEY ("xAccountId") REFERENCES "XAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantChat" ADD CONSTRAINT "AssistantChat_xAccountId_fkey" FOREIGN KEY ("xAccountId") REFERENCES "XAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "AssistantChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedWritingExample" ADD CONSTRAINT "SavedWritingExample_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XApiUsageEvent" ADD CONSTRAINT "XApiUsageEvent_xAccountId_fkey" FOREIGN KEY ("xAccountId") REFERENCES "XAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
