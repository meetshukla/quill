-- A user needs to save their own X developer app before OAuth creates an XAccount.
-- The values are application-encrypted before reaching this table.
CREATE TABLE "XAppCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "clientIdEncrypted" TEXT NOT NULL,
    "clientSecretEncrypted" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "XAppCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "XAppCredential_userId_key" ON "XAppCredential"("userId");
