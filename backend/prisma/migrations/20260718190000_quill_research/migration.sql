-- Per-person research, engagement links, and browser companion credentials.
CREATE TABLE "ResearchItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'POST',
  "url" TEXT NOT NULL,
  "xPostId" TEXT,
  "sourceHandle" TEXT,
  "authorName" TEXT,
  "title" TEXT,
  "text" TEXT NOT NULL DEFAULT '',
  "raw" JSONB,
  "matchedKeywords" JSONB NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "importance" INTEGER NOT NULL DEFAULT 0,
  "reason" TEXT,
  "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ResearchItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ResearchItem_userId_url_key" ON "ResearchItem"("userId", "url");
CREATE INDEX "ResearchItem_userId_status_importance_idx" ON "ResearchItem"("userId", "status", "importance");
CREATE INDEX "ResearchItem_userId_capturedAt_idx" ON "ResearchItem"("userId", "capturedAt");

CREATE TABLE "ResearchRule" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ResearchRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ResearchRule_userId_kind_value_key" ON "ResearchRule"("userId", "kind", "value");
CREATE INDEX "ResearchRule_userId_kind_enabled_idx" ON "ResearchRule"("userId", "kind", "enabled");

CREATE TABLE "ExtensionInstallation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "label" TEXT NOT NULL DEFAULT 'Quill browser companion',
  "lastUsedAt" DATETIME,
  "revokedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ExtensionInstallation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ExtensionInstallation_tokenHash_key" ON "ExtensionInstallation"("tokenHash");
CREATE INDEX "ExtensionInstallation_userId_revokedAt_idx" ON "ExtensionInstallation"("userId", "revokedAt");

CREATE TABLE "ResearchDraft" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "researchItemId" TEXT NOT NULL,
  "scheduledPostId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ResearchDraft_researchItemId_fkey" FOREIGN KEY ("researchItemId") REFERENCES "ResearchItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ResearchDraft_scheduledPostId_fkey" FOREIGN KEY ("scheduledPostId") REFERENCES "ScheduledPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ResearchDraft_researchItemId_key" ON "ResearchDraft"("researchItemId");
CREATE UNIQUE INDEX "ResearchDraft_scheduledPostId_key" ON "ResearchDraft"("scheduledPostId");
