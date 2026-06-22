// Demo data so the Queue UI can be seen without a live X connection.
// Run:  node --env-file=.env --import tsx scripts/seed-demo.ts
// Clear: node --env-file=.env --import tsx scripts/seed-demo.ts --clear
import { prisma } from "../src/db/prisma.js";
import { encryptSecret } from "../src/lib/crypto.js";
import { env } from "../src/config/env.js";

const clear = process.argv.includes("--clear");

if (clear) {
  // Remove only the demo account (xUserId starts with "demo-"); cascades to its
  // posts/drafts/automations. Leaves any real connected account untouched.
  const removed = await prisma.xAccount.deleteMany({
    where: { xUserId: { startsWith: "demo-" } },
  });
  console.log(`cleared demo account(s): ${removed.count}`);
  await prisma.$disconnect();
  process.exit(0);
}

const user = await prisma.user.upsert({
  where: { email: env.DEFAULT_USER_EMAIL },
  create: { email: env.DEFAULT_USER_EMAIL, name: env.DEFAULT_USER_NAME },
  update: {},
});

const account = await prisma.xAccount.upsert({
  where: { userId: user.id },
  create: {
    userId: user.id,
    xUserId: `demo-${user.id.slice(0, 8)}`,
    username: "meetshukla_",
    displayName: "Meet Shukla",
    scopes: ["tweet.read", "users.read", "tweet.write", "media.write", "offline.access"],
    writeEnabled: true,
    accessTokenEncrypted: encryptSecret("demo-access-token"),
    refreshTokenEncrypted: encryptSecret("demo-refresh-token"),
  },
  update: {},
});

const existing = await prisma.scheduledPost.count({ where: { xAccountId: account.id } });
if (existing === 0) {
  const now = Date.now();
  const h = 3_600_000;
  await prisma.scheduledPost.createMany({
    data: [
      {
        xAccountId: account.id,
        status: "DRAFT",
        text: "Shipping every day quietly rewires how you scope work. You stop asking 'is this perfect?' and start asking 'is this true and useful today?' The bar moves from impressive to honest.",
        scheduledAt: new Date(now + 24 * h),
        timezone: "America/Toronto",
        idempotencyKey: "seed-draft-1",
      },
      {
        xAccountId: account.id,
        status: "DRAFT",
        threadParts: {
          parts: [
            "3 habits that did more for my writing than any 'hack':",
            "1. Draft ugly, fast. The first version only has to exist.",
            "2. Cut the first sentence. It's almost always throat-clearing.",
            "3. Read it aloud once. If you stumble, the reader will too.",
          ],
        },
        scheduledAt: new Date(now + 30 * h),
        timezone: "America/Toronto",
        idempotencyKey: "seed-draft-2",
      },
      {
        xAccountId: account.id,
        status: "SCHEDULED",
        text: "Consistency beats intensity. One honest post a day for a year will out-compound any viral week.",
        scheduledAt: new Date(now + 5 * h),
        timezone: "America/Toronto",
        idempotencyKey: "seed-sched-1",
      },
    ],
  });
  console.log("seeded demo account + 2 drafts + 1 scheduled");
} else {
  console.log("queue already has data; nothing seeded");
}

await prisma.$disconnect();
