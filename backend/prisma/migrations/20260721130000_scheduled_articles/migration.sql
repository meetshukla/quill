CREATE TABLE "ScheduledArticle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "xAccountId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "contentState" JSONB NOT NULL,
    "coverAssetId" TEXT,
    "xArticleId" TEXT,
    "reviewUrl" TEXT,
    "scheduledAt" DATETIME,
    "timezone" TEXT,
    "publishedXPostId" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScheduledArticle_xAccountId_fkey" FOREIGN KEY ("xAccountId") REFERENCES "XAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ScheduledArticle_status_scheduledAt_idx" ON "ScheduledArticle"("status", "scheduledAt");
CREATE INDEX "ScheduledArticle_xAccountId_createdAt_idx" ON "ScheduledArticle"("xAccountId", "createdAt");
