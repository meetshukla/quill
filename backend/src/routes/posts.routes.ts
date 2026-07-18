import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { IngestService } from "../services/ingest.service.js";
import { requireUserId } from "../lib/auth.js";

export async function registerPostRoutes(app: FastifyInstance, prisma: PrismaClient) {
  const ingest = new IngestService(prisma);

  // Incremental by default: only fetches tweets newer than what's stored, so
  // repeat syncs cost almost nothing. `full: true` forces a backfill (up to the
  // X cap). Costs Owned Reads only on what it actually pulls.
  app.post("/api/posts/sync", async (request) => {
    const xAccount = await prisma.xAccount.findUniqueOrThrow({ where: { userId: requireUserId(request) } });
    const body = z
      .object({
        max: z.number().int().min(1).max(3200).default(800),
        full: z.boolean().default(false)
      })
      .parse(request.body ?? {});
    return ingest.syncOwnPosts(xAccount, { max: body.max, full: body.full });
  });

  // The stored posts, shaped for voice analysis (each with the post it answered).
  app.get("/api/posts", async (request) => {
    const xAccount = await prisma.xAccount.findUnique({ where: { userId: requireUserId(request) } });
    if (!xAccount) return { posts: [] };
    const query = z
      .object({ limit: z.coerce.number().int().min(1).max(3200).default(800) })
      .parse(request.query ?? {});
    return { posts: await ingest.listForVoice(xAccount.id, query.limit) };
  });
}
