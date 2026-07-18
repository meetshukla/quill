-- Rename the restored personal account without changing its id or any related
-- X account, posts, credentials, drafts, or agent key.
UPDATE "User"
SET "email" = 'meet22599@gmail.com'
WHERE "email" = 'owner@example.com';
