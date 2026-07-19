-- Prepared replies are distinct from ScheduledPost drafts: a browser may show
-- or copy them, but it cannot publish anything.
ALTER TABLE "ResearchItem" ADD COLUMN "openedAt" DATETIME;

CREATE TABLE "ResearchReply" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "researchItemId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'READY',
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ResearchReply_researchItemId_fkey" FOREIGN KEY ("researchItemId") REFERENCES "ResearchItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ResearchReply_researchItemId_key" ON "ResearchReply"("researchItemId");
CREATE INDEX "ResearchReply_status_createdAt_idx" ON "ResearchReply"("status", "createdAt");
