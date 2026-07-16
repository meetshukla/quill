-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OAuthState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "redirectAfter" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "XAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "xUserId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "accessTokenEncrypted" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT,
    "scopes" JSONB NOT NULL DEFAULT [],
    "writeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" DATETIME,
    "analyticsLastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "XAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "xAccountId" TEXT NOT NULL,
    "xPostId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAtX" DATETIME NOT NULL,
    "postType" TEXT NOT NULL,
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
    "engagementRate" REAL,
    "lastMetricsSyncedAt" DATETIME,
    "rawX" JSONB,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Post_xAccountId_fkey" FOREIGN KEY ("xAccountId") REFERENCES "XAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScheduledPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "xAccountId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "text" TEXT,
    "threadParts" JSONB,
    "quotePostId" TEXT,
    "replyToPostId" TEXT,
    "media" JSONB,
    "ctaConfig" JSONB,
    "scheduledAt" DATETIME NOT NULL,
    "timezone" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "postedXPostId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScheduledPost_xAccountId_fkey" FOREIGN KEY ("xAccountId") REFERENCES "XAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CtaSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "xAccountId" TEXT NOT NULL,
    "text" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CtaSetting_xAccountId_fkey" FOREIGN KEY ("xAccountId") REFERENCES "XAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CtaAutomation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "xAccountId" TEXT NOT NULL,
    "sourceXPostId" TEXT NOT NULL,
    "ctaText" TEXT NOT NULL,
    "likeThreshold" INTEGER NOT NULL DEFAULT 50,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "replyXPostId" TEXT,
    "lastCheckedAt" DATETIME,
    "expiresAt" DATETIME NOT NULL,
    "postedAt" DATETIME,
    "idempotencyKey" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CtaAutomation_xAccountId_fkey" FOREIGN KEY ("xAccountId") REFERENCES "XAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AutoRepostRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "xAccountId" TEXT NOT NULL,
    "sourceXPostId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "cadenceHours" INTEGER NOT NULL,
    "nextRunAt" DATETIME NOT NULL,
    "lastRunAt" DATETIME,
    "lastRepostXPostId" TEXT,
    "idempotencySeed" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AutoRepostRule_xAccountId_fkey" FOREIGN KEY ("xAccountId") REFERENCES "XAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssistantChat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "xAccountId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AssistantChat_xAccountId_fkey" FOREIGN KEY ("xAccountId") REFERENCES "XAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssistantMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "structuredActions" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssistantMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "AssistantChat" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SavedWritingExample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "text" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SavedWritingExample_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "XApiUsageEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "xAccountId" TEXT,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "operationType" TEXT NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 1,
    "resourcesReturned" INTEGER NOT NULL DEFAULT 0,
    "ownedResourcesCharged" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" REAL NOT NULL DEFAULT 0,
    "statusCode" INTEGER,
    "rateLimitLimit" INTEGER,
    "rateLimitRemaining" INTEGER,
    "rateLimitReset" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "XApiUsageEvent_xAccountId_fkey" FOREIGN KEY ("xAccountId") REFERENCES "XAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "availableAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AppConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "ownerPasswordHash" TEXT,
    "xClientIdEncrypted" TEXT,
    "xClientSecretEncrypted" TEXT,
    "agentApiKeyEncrypted" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
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
