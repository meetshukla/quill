import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AppConfigService } from "../services/app-config.service.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { env } from "../config/env.js";

// First-run setup + owner auth for self-hosted instances. The flow the UI
// drives: set owner password → login → paste X app credentials → connect X →
// copy the agent key.
export async function registerSetupRoutes(app: FastifyInstance, prisma: PrismaClient) {
  const config = new AppConfigService(prisma);

  // Public: lets the UI decide which step to show.
  app.get("/api/setup/status", async () => config.getStatus());

  // Claim the instance — only works while no owner password exists.
  app.post("/api/setup/owner", async (request, reply) => {
    const existing = await config.getOwnerPasswordHash();
    if (existing) return reply.code(409).send({ error: "owner_already_set" });
    const body = z.object({ password: z.string().min(8) }).parse(request.body);
    await config.setOwnerPasswordHash(hashPassword(body.password));
    const token = app.jwt.sign({ role: "owner" }, { expiresIn: "30d" });
    return { token };
  });

  app.post("/api/auth/login", async (request, reply) => {
    const body = z.object({ password: z.string() }).parse(request.body);
    const hash = await config.getOwnerPasswordHash();
    if (!hash || !verifyPassword(body.password, hash)) {
      return reply.code(401).send({ error: "invalid_password" });
    }
    const token = app.jwt.sign({ role: "owner" }, { expiresIn: "30d" });
    return { token };
  });

  // Store the X app credentials (encrypted) — entered in the UI, no .env edit.
  app.put("/api/setup/x-credentials", async (request) => {
    const body = z
      .object({ clientId: z.string().min(1), clientSecret: z.string().min(1) })
      .parse(request.body);
    await config.setXCredentials(body.clientId.trim(), body.clientSecret.trim());
    return { ok: true, callbackUrl: config.callbackUrl() };
  });

  // The agent's credentials — shown in the UI to copy into agent/.env.
  app.get("/api/setup/agent", async () => ({
    apiUrl: env.API_BASE_URL,
    apiKey: await config.getOrCreateAgentKey()
  }));
}
