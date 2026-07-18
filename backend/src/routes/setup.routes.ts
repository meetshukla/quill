import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AppConfigService } from "../services/app-config.service.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { env } from "../config/env.js";
import { requireUserId } from "../lib/auth.js";
import { PersonalAccountService } from "../services/personal-account.service.js";

// Personal account signup/login, plus first-run configuration of the shared
// Quill X developer app. Each signed-in person connects their own X account
// and receives an agent key scoped only to that account.
export async function registerSetupRoutes(app: FastifyInstance, prisma: PrismaClient) {
  const config = new AppConfigService(prisma);
  const accounts = new PersonalAccountService(prisma);

  app.get("/api/setup/status", async (request) => config.getStatus(requireUserId(request)));

  app.post("/api/auth/signup", async (request, reply) => {
    const body = z.object({
      email: z.string().email().transform((email) => email.trim().toLowerCase()),
      name: z.string().trim().min(1).max(100).optional(),
      password: z.string().min(8)
    }).parse(request.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) return reply.code(409).send({ error: "email_already_registered" });
    const user = await prisma.user.create({
      data: { email: body.email, name: body.name, passwordHash: hashPassword(body.password) }
    });
    return { token: app.jwt.sign({ sub: user.id }, { expiresIn: "30d" }) };
  });

  app.post("/api/auth/login", async (request, reply) => {
    const body = z.object({
      email: z.string().email().transform((email) => email.trim().toLowerCase()),
      password: z.string()
    }).parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user?.passwordHash || !verifyPassword(body.password, user.passwordHash)) {
      return reply.code(401).send({ error: "invalid_password" });
    }
    const token = app.jwt.sign({ sub: user.id }, { expiresIn: "30d" });
    return { token };
  });

  // The shared X developer app can be configured once. After that, any person
  // can safely connect their own X account without being able to replace it.
  app.put("/api/setup/x-credentials", async (request, reply) => {
    const body = z
      .object({ clientId: z.string().min(1), clientSecret: z.string().min(1) })
      .parse(request.body);
    const status = await config.getStatus(requireUserId(request));
    if (status.hasXCredentials) {
      return reply.code(409).send({ error: "x_credentials_already_configured" });
    }
    await config.setXCredentials(body.clientId.trim(), body.clientSecret.trim());
    return { ok: true, callbackUrl: config.callbackUrl() };
  });

  // The agent's credentials — shown in the UI to copy into agent/.env.
  app.get("/api/setup/agent", async (request) => ({
    apiUrl: env.API_BASE_URL,
    apiKey: await accounts.getOrCreateAgentKey(requireUserId(request))
  }));
}
