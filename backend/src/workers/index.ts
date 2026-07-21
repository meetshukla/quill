import { prisma } from "../db/prisma.js";
import { CtaService } from "../services/cta.service.js";
import { ArticleService } from "../services/article.service.js";
import { RepostService } from "../services/repost.service.js";
import { ScheduleService } from "../services/schedule.service.js";

const schedule = new ScheduleService(prisma);
const cta = new CtaService(prisma);
const repost = new RepostService(prisma);
const articles = new ArticleService(prisma);

async function tick() {
  await schedule.publishDue();
  await articles.publishDue();
  await cta.checkPending();
  await repost.executeDue();
}

/**
 * Starts the background worker loop in-process. It's fused into the API server
 * (see server.ts) so a single Railway service runs API + worker — no separate
 * always-on service to pay for. Runs one immediate tick, then every 60s.
 * Returns the interval handle so a caller (or a test) can stop it.
 */
export function startWorker(): NodeJS.Timeout {
  // Fire the first tick but don't block server startup on it.
  tick().catch((error) => {
    console.error("worker tick failed", error);
  });

  return setInterval(() => {
    tick().catch((error) => {
      console.error("worker tick failed", error);
    });
  }, 60_000);
}

// Allow running the worker standalone in local dev via `pnpm run worker`.
// `import.meta.url` matches the entrypoint only when this file is invoked
// directly, not when it's imported by the server.
if (import.meta.url === `file://${process.argv[1]}`) {
  startWorker();
}
