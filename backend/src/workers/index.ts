import { prisma } from "../db/prisma.js";
import { CtaService } from "../services/cta.service.js";
import { RepostService } from "../services/repost.service.js";
import { ScheduleService } from "../services/schedule.service.js";

const schedule = new ScheduleService(prisma);
const cta = new CtaService(prisma);
const repost = new RepostService(prisma);

async function tick() {
  await schedule.publishDue();
  await cta.checkPending();
  await repost.executeDue();
}

setInterval(() => {
  tick().catch((error) => {
    console.error("worker tick failed", error);
  });
}, 60_000);

await tick();

