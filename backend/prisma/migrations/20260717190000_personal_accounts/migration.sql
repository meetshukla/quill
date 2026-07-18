-- Personal Quill accounts: every browser session and agent key resolves to
-- one User, whose existing XAccount already owns all of its content.
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
ALTER TABLE "User" ADD COLUMN "agentApiKeyEncrypted" TEXT;
ALTER TABLE "User" ADD COLUMN "agentApiKeyHash" TEXT;

CREATE UNIQUE INDEX "User_agentApiKeyHash_key" ON "User"("agentApiKeyHash");
