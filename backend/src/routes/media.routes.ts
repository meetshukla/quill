import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { requireUserId } from "../lib/auth.js";
import { MediaAssetService } from "../services/media-asset.service.js";

export async function registerMediaRoutes(app: FastifyInstance, prisma: PrismaClient) {
  const media = new MediaAssetService(prisma);

  app.get("/api/media/assets", async (request) => {
    const account = await prisma.xAccount.findUniqueOrThrow({ where: { userId: requireUserId(request) } });
    return { assets: await media.list(account.id) };
  });

  app.get("/api/media/assets/:id/content", async (request, reply) => {
    const account = await prisma.xAccount.findUniqueOrThrow({ where: { userId: requireUserId(request) } });
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const result = await media.read(id, account.id);
    if (!result) return reply.code(404).send({ error: "media_asset_not_found" });
    return reply
      .header("Content-Type", result.asset.contentType)
      .header("Content-Length", String(result.bytes.length))
      .header("Content-Disposition", `inline; filename="${result.asset.filename}"`)
      .header("Cache-Control", "private, max-age=300")
      .send(result.bytes);
  });

  // Raw binary keeps the agent/UI upload path simple and avoids exposing the
  // connected X token to a browser. The asset is uploaded to X only when a
  // human-approved post is actually published.
  app.post("/api/media/assets", async (request) => {
    const account = await prisma.xAccount.findUniqueOrThrow({ where: { userId: requireUserId(request) } });
    const contentType = (request.headers["content-type"] ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? "";
    const filenameHeader = request.headers["x-quill-filename"];
    const filename = typeof filenameHeader === "string" ? filenameHeader : "upload";
    const body = request.body;
    if (!Buffer.isBuffer(body)) throw new Error("Media upload requires a binary image or video body");
    return { asset: await media.create(account.id, { filename, contentType, bytes: body }) };
  });

  app.delete("/api/media/assets/:id", async (request) => {
    const account = await prisma.xAccount.findUniqueOrThrow({ where: { userId: requireUserId(request) } });
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    return media.remove(params.id, account.id);
  });
}
