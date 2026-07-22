-- Each Quill person can bring their own X developer app and user tokens.
-- Existing restored connections continue to fall back to the legacy app config.
ALTER TABLE "XAccount" ADD COLUMN "xClientIdEncrypted" TEXT;
ALTER TABLE "XAccount" ADD COLUMN "xClientSecretEncrypted" TEXT;
