CREATE TABLE "ManagedAccountAccess" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "xAccountId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ManagedAccountAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ManagedAccountAccess_xAccountId_fkey" FOREIGN KEY ("xAccountId") REFERENCES "XAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ManagedAccountAccess_userId_xAccountId_key" ON "ManagedAccountAccess"("userId", "xAccountId");
CREATE INDEX "ManagedAccountAccess_xAccountId_idx" ON "ManagedAccountAccess"("xAccountId");

-- Quill is intentionally a two-member private product. Existing members
-- receive access to both existing connected X accounts during this migration.
INSERT OR IGNORE INTO "ManagedAccountAccess" ("id", "userId", "xAccountId", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(16))), u."id", a."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User" u CROSS JOIN "XAccount" a;
